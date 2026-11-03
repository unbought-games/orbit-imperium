use super::*;
use std::collections::{BTreeMap, BTreeSet};
/// Delete only rows transitively owned by this universe. Foreign-key metadata is
/// trusted schema, never user input. Children are removed before their parents.
pub(super) async fn remove_world(tx: &mut Tx<'_>, u: UniverseId) -> Result<()> {
    let edges:Vec<(String,String,Vec<String>,Vec<String>)>=sqlx::query_as("SELECT child.relname,parent.relname,ARRAY(SELECT quote_ident(a.attname) FROM unnest(c.conkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.o),ARRAY(SELECT quote_ident(a.attname) FROM unnest(c.confkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.o) FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace WHERE c.contype='f' AND ns.nspname='public'").fetch_all(&mut **tx).await?;
    fn visit(
        table: &str,
        predicate: String,
        edges: &[(String, String, Vec<String>, Vec<String>)],
        path: &mut BTreeSet<String>,
        out: &mut Vec<String>,
    ) -> Result<()> {
        if !path.insert(table.into()) {
            return Err(format!("cannot replace world: cyclic foreign key at {table}").into());
        }
        for (child, parent, keys, refs) in edges.iter().filter(|(_, p, _, _)| p == table) {
            let pred = format!(
                "({}) IN (SELECT {} FROM \"{}\" WHERE {})",
                keys.join(","),
                refs.join(","),
                parent,
                predicate
            );
            visit(child, pred, edges, path, out)?;
        }
        out.push(format!("DELETE FROM \"{table}\" WHERE {predicate}"));
        path.remove(table);
        Ok(())
    }
    let mut statements = Vec::new();
    visit(
        "universes",
        "id=$1".into(),
        &edges,
        &mut BTreeSet::new(),
        &mut statements,
    )?;
    // Materialize each affected row set before deleting any parent; paths can overlap.
    let mut targets: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut order = Vec::new();
    for statement in statements {
        let rest = statement.strip_prefix("DELETE FROM ").unwrap();
        let (table, predicate) = rest.split_once(" WHERE ").unwrap();
        let rows: Vec<String> =
            sqlx::query_scalar(&format!("SELECT ctid::text FROM {table} WHERE {predicate}"))
                .bind(u.0)
                .fetch_all(&mut **tx)
                .await?;
        targets.entry(table.into()).or_default().extend(rows);
        if !order.contains(&table.to_string()) {
            order.push(table.to_string());
        }
    }
    for table in order {
        let rows: Vec<_> = targets
            .remove(&table)
            .unwrap_or_default()
            .into_iter()
            .collect();
        sqlx::query(&format!("DELETE FROM {table} WHERE ctid=ANY($1::tid[])"))
            .bind(rows)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}
pub(super) async fn install_rules(tx: &mut Tx<'_>, u: UniverseId, r: &Ruleset) -> Result<()> {
    r.validate()?;
    let current = crate::facts::rules(tx, u).await?;
    if current.artifact.universe != r.artifact.universe || current.speed != r.speed {
        return Err(
            "scenario rules topology/speed must match scenario universe configuration".into(),
        );
    }
    sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(&r.hash.0)
        .bind(&r.artifact.id)
        .bind(sqlx::types::Json(r))
        .execute(&mut **tx)
        .await?;
    sqlx::query("UPDATE universes SET profile_hash=$2 WHERE id=$1")
        .bind(u.0)
        .bind(&r.hash.0)
        .execute(&mut **tx)
        .await?;
    Ok(())
}
