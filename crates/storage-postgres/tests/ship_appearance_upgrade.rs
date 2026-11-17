use orbit_application::*;
use orbit_storage_postgres::PgStore;
use sqlx::types::Json;
use uuid::Uuid;

#[tokio::test]
async fn migration_copies_each_empires_authored_recipe_and_retains_prior_history() {
    let url = std::env::var("TEST_DATABASE_URL").unwrap();
    let store = PgStore::connect(&url).await.unwrap();
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let older = sqlx::migrate::Migrator {
        migrations: sqlx::migrate!("./migrations")
            .iter()
            .filter(|m| m.version < 48)
            .cloned()
            .collect::<Vec<_>>()
            .into(),
        ..sqlx::migrate::Migrator::DEFAULT
    };
    store.migrate_with_for_test(&older).await.unwrap();
    let account = Uuid::new_v4();
    let template = Uuid::new_v4();
    sqlx::query("INSERT INTO rulesets VALUES('ship-upgrade-fixture','fixture','{}')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO accounts(id,name,password_hash) VALUES($1,'Ship upgrade','hash')")
        .bind(account)
        .execute(&pool)
        .await
        .unwrap();
    let empires: Vec<_> = (0..2)
        .map(|_| (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()))
        .collect();
    let recipe = InsigniaRecipe {
        symbol: "temporarily-uninstalled-symbol".into(),
        ..Default::default()
    };
    sqlx::query("INSERT INTO insignia_designs(account,id,name,recipe,revision) VALUES($1,$2,'Retained emblem',$3,4)").bind(account).bind(template).bind(Json(&recipe)).execute(&pool).await.unwrap();
    for &(universe, epoch, player) in &empires {
        sqlx::query("INSERT INTO universes(id,epoch,development,speed,started_at,profile_hash,name) VALUES($1,$2,true,1,1000,'ship-upgrade-fixture','Upgrade '||$1::text)").bind(universe).bind(epoch).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO players(id,universe) VALUES($1,$2)")
            .bind(player)
            .bind(universe)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO universe_memberships(universe,account,player) VALUES($1,$2,$3)")
            .bind(universe)
            .bind(account)
            .bind(player)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO empire_insignias(universe,account,design_id) VALUES($1,$2,$3)")
            .bind(universe)
            .bind(account)
            .bind(template)
            .execute(&pool)
            .await
            .unwrap();
    }
    let before:Vec<(Uuid,i64,Option<Json<serde_json::Value>>)>=sqlx::query_as("SELECT player,observed_at,recipe FROM orbit_appearance_history ORDER BY player,observed_at").fetch_all(&pool).await.unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let after:Vec<(Uuid,i64,Option<Json<serde_json::Value>>)>=sqlx::query_as("SELECT player,observed_at,recipe FROM orbit_appearance_history ORDER BY player,observed_at").fetch_all(&pool).await.unwrap();
    assert_eq!(
        before, after,
        "migration never rewrites historical evidence"
    );
    for &(u, _, _) in &empires {
        let (saved, revision): (Json<InsigniaRecipe>, i64) = sqlx::query_as(
            "SELECT recipe,revision FROM empire_insignias WHERE universe=$1 AND account=$2",
        )
        .bind(u)
        .bind(account)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(saved.0, recipe);
        assert_eq!(revision, 1);
    }
    // New writer changes one empire; the unsupported recipe remains in the other.
    let (u, epoch, player) = empires[0];
    let b = Binding {
        universe: UniverseId(u),
        epoch: Epoch(epoch),
        account: AccountId(account),
        player: PlayerId(player),
    };
    store
        .change_insignia(
            b,
            InsigniaAction::Save {
                design: InsigniaDesign {
                    id: template,
                    name: "New".into(),
                    recipe: InsigniaRecipe::default(),
                    revision: 4,
                },
                equip: true,
            },
            &InsigniaCatalog::default(),
            CosmeticPolicy::Unrestricted,
            Default::default(),
        )
        .await
        .unwrap();
    let retained: Json<InsigniaRecipe> =
        sqlx::query_scalar("SELECT recipe FROM empire_insignias WHERE universe=$1 AND account=$2")
            .bind(empires[1].0)
            .bind(account)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(retained.0, recipe);
    for (player, at, recipe) in before {
        let unchanged: Option<Json<serde_json::Value>> = sqlx::query_scalar(
            "SELECT recipe FROM orbit_appearance_history WHERE player=$1 AND observed_at=$2",
        )
        .bind(player)
        .bind(at)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(unchanged, recipe);
    }
    assert!(
        sqlx::query("UPDATE insignia_designs SET recipe='{}' WHERE account=$1 AND id=$2")
            .bind(account)
            .bind(template)
            .execute(&pool)
            .await
            .is_err(),
        "old binaries cannot silently mutate templates"
    );
}
