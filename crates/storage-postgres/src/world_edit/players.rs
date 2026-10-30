use super::*;
use crate::bootstrap::{Member, insert_member, load_manifest};
pub(super) async fn resolve(tx: &mut Tx<'_>, u: UniverseId, name: &str) -> Result<PlayerId> {
    let rows:Vec<Uuid>=sqlx::query_scalar("SELECT m.player FROM universe_memberships m JOIN accounts a ON a.id=m.account WHERE m.universe=$1 AND a.name=$2 ORDER BY m.player").bind(u.0).bind(name.trim().to_lowercase()).fetch_all(&mut **tx).await?;
    match rows.as_slice() {
        [p] => Ok(PlayerId(*p)),
        [] => Err(format!("user {name} is not in this universe").into()),
        _ => Err(format!("username {name} is ambiguous").into()),
    }
}
pub(super) async fn add(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    r: &Ruleset,
    e: &WorldEdit,
) -> Result<Value> {
    let name = e
        .user
        .as_deref()
        .or(e.name.as_deref())
        .ok_or("add-player/add-bot requires user")?
        .trim()
        .to_lowercase();
    if name.is_empty() || name.len() > 80 || name.chars().any(char::is_control) {
        return Err("username must contain 1–80 bytes without control characters".into());
    }
    let bot = e.op.eq_ignore_ascii_case("add-bot");
    let accounts: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM accounts WHERE name=$1")
        .bind(&name)
        .fetch_all(&mut **tx)
        .await?;
    let account = match accounts.as_slice() {
        [] => Uuid::new_v4(),
        [a] => *a,
        _ => return Err("username is ambiguous".into()),
    };
    if sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM universe_memberships WHERE universe=$1 AND account=$2)",
    )
    .bind(i.universe.0)
    .bind(account)
    .fetch_one(&mut **tx)
    .await?
    {
        return Err(format!("user {name} already belongs to this world; use set").into());
    }
    let password = if bot {
        "!machine".into()
    } else if accounts.is_empty() {
        let p = e.password.as_deref().ok_or("new user requires password")?;
        if p.is_empty() || p.len() > 1024 {
            return Err("password must have 1–1024 bytes".into());
        }
        hash_password(p)?
    } else {
        String::new()
    };
    let (secret, mut manifest) = load_manifest(tx, i.universe).await?;
    let profile = r
        .artifact
        .universe
        .as_ref()
        .ok_or("world has no topology")?;
    let occupied: Vec<(i32, i32, i32)> = sqlx::query_as(
        "SELECT galaxy,system,position FROM bodies WHERE universe=$1 AND kind='Planet' UNION SELECT (data->'coordinates'->>'galaxy')::integer,(data->'coordinates'->>'system')::integer,(data->'coordinates'->>'position')::integer FROM planet_abandonments WHERE universe=$1 AND NOT (data->>'released')::boolean",
    )
    .bind(i.universe.0)
    .fetch_all(&mut **tx)
    .await?;
    let occupied: Vec<_> = occupied
        .into_iter()
        .map(|(g, s, p)| Coordinates {
            galaxy: g as u32,
            system: s as u32,
            position: p as u32,
        })
        .collect();
    let homes = manifest
        .members
        .iter()
        .map(|m| m.homeworld.coordinates)
        .collect::<Vec<_>>();
    // Explicit operator coordinates retain their historical creation path and
    // must not inherit automatic placement's Galaxy 1 capacity restriction.
    let allocate = if e.planet.is_some() || e.from.is_some() {
        balanced_homeworld
    } else {
        neighborhood_homeworld
    };
    let mut home = allocate(
        &secret,
        i.universe,
        i.epoch,
        profile,
        manifest.members.len(),
        &homes,
        &occupied,
    )?;
    if e.planet.is_none()
        && let Some(near) = &e.from
    {
        let near = coordinates(near)?;
        let c = (4..=12)
            .map(|position| Coordinates { position, ..near })
            .find(|c| !occupied.contains(c))
            .ok_or("no empty homeworld near requested coordinates")?;
        home.coordinates = c;
        let lows = [
            220, 170, 120, 70, 60, 50, 40, 30, 20, 10, 0, -10, -50, -90, -130,
        ];
        home.max_temperature = lows[(c.position - 1) as usize] + 20;
        home.validate(profile)?;
    }
    if let Some(c) = &e.planet {
        home.coordinates = coordinates(c)?;
        if occupied.contains(&home.coordinates) {
            return Err("home planet coordinates are occupied".into());
        }
        let lows = [
            220, 170, 120, 70, 60, 50, 40, 30, 20, 10, 0, -10, -50, -90, -130,
        ];
        home.max_temperature = lows[(home.coordinates.position - 1) as usize] + 20;
        home.validate(profile)?;
    }
    let member = Member {
        name: name.clone(),
        account,
        player: Uuid::new_v4(),
        body: Uuid::new_v4(),
        homeworld: home,
    };
    insert_member(tx, i.universe, &member, &password, i.at, r).await?;
    let binding = Binding {
        account: AccountId(account),
        player: PlayerId(member.player),
        universe: i.universe,
        epoch: i.epoch,
    };
    if bot {
        crate::bots::enroll(tx, binding, (((i.at / 60_000) + 720) % 1440) as u16, i.at).await?;
    }
    let label = coordinate_label(member.homeworld.coordinates);
    manifest.members.push(member);
    sqlx::query("UPDATE mvp_bootstraps SET manifest=$2 WHERE universe=$1")
        .bind(i.universe.0)
        .bind(sqlx::types::Json(manifest))
        .execute(&mut **tx)
        .await?;
    sqlx::query("UPDATE world_heads SET revision=revision+1 WHERE universe=$1")
        .bind(i.universe.0)
        .execute(&mut **tx)
        .await?;
    let viewers: Vec<Uuid> =
        sqlx::query_scalar("SELECT player FROM viewer_heads WHERE universe=$1")
            .bind(i.universe.0)
            .fetch_all(&mut **tx)
            .await?;
    notify(tx, i, viewers.into_iter().map(PlayerId).collect()).await?;
    Ok(json!({"op":e.op,"user":name,"planet":label}))
}
pub(super) async fn message(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    e: &WorldEdit,
    recipient: PlayerId,
) -> Result<Value> {
    let sender = resolve(
        tx,
        i.universe,
        e.from.as_deref().ok_or("message requires from username")?,
    )
    .await?;
    let text = e.text.as_deref().ok_or("message requires text")?;
    if !valid_social_body(text) {
        return Err("message must contain 1–4000 valid characters".into());
    }
    let account = sqlx::query_scalar(
        "SELECT account FROM universe_memberships WHERE universe=$1 AND player=$2",
    )
    .bind(i.universe.0)
    .bind(sender.0)
    .fetch_one(&mut **tx)
    .await?;
    let b = Binding {
        account: AccountId(account),
        player: sender,
        universe: i.universe,
        epoch: i.epoch,
    };
    let id = crate::social::commands::apply(
        tx,
        b,
        &SocialAction::Send {
            player: recipient,
            body: text.into(),
        },
        i.at,
    )
    .await?;
    notify(tx, i, std::collections::BTreeSet::from([sender, recipient])).await?;
    Ok(json!({"op":"message","message":id,"user":e.user}))
}

pub(super) async fn participation(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    p: PlayerId,
    state: &str,
) -> Result<()> {
    let changed = if state.eq_ignore_ascii_case("retired") {
        sqlx::query("UPDATE bot_participation SET retired_at=$3,retirement_reason='world edit' WHERE universe=$1 AND player=$2").bind(i.universe.0).bind(p.0).bind(i.at).execute(&mut **tx).await?.rows_affected()
    } else {
        sqlx::query("UPDATE bot_participation SET sleep_start_utc_minute=$3 WHERE universe=$1 AND player=$2 AND retired_at IS NULL").bind(i.universe.0).bind(p.0).bind(((i.at/60000)%1440)as i32).execute(&mut **tx).await?.rows_affected()
    };
    if changed != 1 {
        return Err("selected user is not an eligible bot".into());
    }
    Ok(())
}

pub(super) async fn alliance(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    e: &WorldEdit,
    owner: PlayerId,
) -> Result<Value> {
    let account = sqlx::query_scalar(
        "SELECT account FROM universe_memberships WHERE universe=$1 AND player=$2",
    )
    .bind(i.universe.0)
    .bind(owner.0)
    .fetch_one(&mut **tx)
    .await?;
    let b = Binding {
        account: AccountId(account),
        player: owner,
        universe: i.universe,
        epoch: i.epoch,
    };
    let state = orbit_engine::alliances::AllianceState::create(
        Uuid::new_v4(),
        owner,
        e.name.clone().ok_or("alliance requires name")?,
        e.text.clone().ok_or("alliance requires text as tag")?,
        i.at,
        [Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()],
    )
    .map_err(|e| format!("{e:?}"))?;
    crate::alliances::persistence::history(tx, b, None, Some(&state), i.at).await?;
    crate::alliances::persistence::save(tx, b, &state).await?;
    notify(tx, i, std::collections::BTreeSet::from([owner])).await?;
    Ok(json!({"op":"alliance","name":state.name,"user":e.user}))
}

async fn notify(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    players: std::collections::BTreeSet<PlayerId>,
) -> Result<()> {
    for p in &players {
        sqlx::query("UPDATE viewer_heads SET revision=revision+1,changed_at=$3,changed_at_generation=(SELECT mode_generation FROM universe_runtime WHERE universe=$1) WHERE universe=$1 AND player=$2").bind(i.universe.0).bind(p.0).bind(i.at).execute(&mut **tx).await?;
    }
    crate::updates::append_updates(tx, i, None, &players).await?;
    Ok(())
}
