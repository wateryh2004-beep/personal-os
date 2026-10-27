"""Official pg-meta type generation against this run's isolated synthetic PG17 only."""
import json
import hashlib
import os
import re
import subprocess
from pathlib import Path

IMAGE = "supabase/postgres-meta:v0.96.4"  # supabase CLI 2.95.4 `services --output json`
POSTGRES_DATA = "/var/lib/postgresql/data"


def verify_synthetic_isolation(db, output: Path):
    """Allow only this run's image-created, auto-removed anonymous PG17 data volume.

    postgres:17 declares VOLUME /var/lib/postgresql/data even without -v:
    https://hub.docker.com/_/postgres (PGDATA, PostgreSQL 17 and below).
    Docker removes its automatically created anonymous volume with --rm:
    https://docs.docker.com/engine/storage/volumes/#named-and-anonymous-volumes
    Caller mounts, existing/named volumes, host ports and host networks stay forbidden.
    """
    if not db.started or not re.fullmatch(r"personal-os-rehearsal-[0-9a-f]{32}", db.name):
        raise RuntimeError("Type generation requires this rehearsal's disposable container")
    container = json.loads(db.command(["inspect", db.name]))[0]
    host = container.get("HostConfig", {})
    config = container.get("Config", {})
    mounts = container.get("Mounts", [])
    network = container.get("NetworkSettings", {})
    ports = network.get("Ports")
    checks = {
        "ownedContainer": container.get("Name") == "/" + db.name and container.get("State", {}).get("Running") is True,
        "networkNone": host.get("NetworkMode") == "none",
        "noAdditionalNetworks": isinstance(network.get("Networks"), dict) and set(network["Networks"]) == {"none"},
        "noPublishedPorts": not host.get("PortBindings") and host.get("PublishAllPorts") is False
            and (ports is None or isinstance(ports, dict) and not any(ports.values())),
        "autoRemove": host.get("AutoRemove") is True,
        "noCallerMounts": host.get("Binds") in (None, []) and host.get("Mounts") in (None, [])
            and host.get("VolumesFrom") in (None, []) and host.get("Tmpfs") in (None, {})
            and host.get("VolumeDriver") in (None, ""),
        "noPrivilegedDevices": host.get("Privileged") is False and host.get("Devices") in (None, [])
            and host.get("DeviceRequests") in (None, []),
        "postgres17Image": config.get("Image") == "postgres:17",
        "onlyImageDataDestination": config.get("Volumes") == {POSTGRES_DATA: {}},
        "singleDataVolume": isinstance(mounts, list) and len(mounts) == 1 and mounts[0].get("Type") == "volume"
            and mounts[0].get("Destination") == POSTGRES_DATA and mounts[0].get("Driver") == "local"
            and mounts[0].get("RW") is True and mounts[0].get("Mode") == "" and mounts[0].get("Propagation") == "",
    }
    mount = mounts[0] if isinstance(mounts, list) and len(mounts) == 1 else {}
    name = mount.get("Name", "")
    checks["anonymousNameShape"] = isinstance(name, str) and re.fullmatch(r"[0-9a-f]{64}", name) is not None
    # The fixed image is inspected by its existing local tag, never a caller URL.
    image = json.loads(db.command(["image", "inspect", "postgres:17"]))[0]
    checks["officialPulledImage"] = container.get("Image") == image.get("Id") and bool(
        re.fullmatch(r"sha256:[0-9a-f]{64}", image.get("Id", ""))) and image.get("Config", {}).get("Volumes") == {POSTGRES_DATA: {}} and any(
        re.fullmatch(r"(?:docker\.io/library/)?postgres@sha256:[0-9a-f]{64}", digest)
        for digest in image.get("RepoDigests", []))
    volume = None
    if all(checks.values()):
        # A name can be inspected only after confirming its fixed anonymous shape
        # and absence of every caller-specified mount route in HostConfig.
        volume = json.loads(db.command(["volume", "inspect", name]))[0]
    source = mount.get("Source")
    checks["dockerManagedAnonymousVolume"] = volume is not None and volume.get("Name") == name \
        and volume.get("Driver") == "local" and volume.get("Scope") == "local" \
        and volume.get("Options") in (None, {}) \
        and volume.get("Labels") in (None, {}, {"com.docker.volume.anonymous": ""}) \
        and isinstance(source, str) and source == volume.get("Mountpoint") \
        and source.endswith("/volumes/" + name + "/_data")
    accepted = all(checks.values())
    # Never persist host Source/Mountpoint, random names, environment or URLs.
    evidence = {"accepted": accepted, "network": "none" if host.get("NetworkMode") == "none" else "other",
        "hostPorts": not checks["noPublishedPorts"], "checks": checks,
        "mounts": [{"type": item.get("Type") if item.get("Type") in ("volume", "bind", "tmpfs") else "other",
                    "destination": POSTGRES_DATA if item.get("Destination") == POSTGRES_DATA else "other"}
                   for item in mounts] if isinstance(mounts, list) else [],
        "productionAccess": False}
    (output / "typegen-isolation.json").write_text(json.dumps(evidence, indent=2) + "\n")
    if not accepted:
        reason = next(key for key, valid in checks.items() if not valid)
        raise RuntimeError("Synthetic database isolation changed: " + reason + "; see sanitized isolation artifact")


def verify_schema_types(db, output: Path, migrations):
    verify_synthetic_isolation(db, output)
    probes = subprocess.run(["node", "scripts/check-continuous-type-gate.mjs"], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=60)
    (output / "type-gate-negative-probes.log").write_text(probes.stdout + probes.stderr)
    if probes.returncode:
        raise RuntimeError("Synthetic type gate negative probes failed; see artifact")
    # The generator joins only the new container's isolated network namespace.
    # No host port, host network, mount, production URL or caller URL exists.
    generated = db.command(["run", "--rm", "--network", "container:" + db.name,
        "--env", "PG_META_DB_URL=postgresql://postgres@127.0.0.1:5432/source_fixture?sslmode=disable",
        "--env", "PG_META_GENERATE_TYPES=typescript", "--env", "PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS=public",
        "--env", "PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS=true", IMAGE, "node", "dist/server/server.js"])
    if "export type Json" not in generated or "export type Database" not in generated:
        raise RuntimeError("Official generator did not return database TypeScript")
    actual = output / "actual-database.types.ts"
    actual.write_text(generated)
    image = json.loads(db.command(["image", "inspect", IMAGE]))[0]
    (output / "typegen-runtime.json").write_text(json.dumps({"generatedTypesSha256": hashlib.sha256(generated.encode()).hexdigest(), "generator": IMAGE, "imageId": image["Id"], "repoDigests": image.get("RepoDigests", []), "cliVersionReference": "2.95.4", "network": "container:" + db.name, "databaseNetwork": "none", "hostPorts": False, "productionAccess": False, "actualCheckoutSha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=Path(__file__).resolve().parents[1], text=True).strip(), "eventSha": os.environ.get("GITHUB_SHA"), "migrations": [{"name": migration.name, "sha256": hashlib.sha256(migration.read_bytes()).hexdigest()} for migration in migrations]}, indent=2) + "\n")
    catalog = json.loads(db.sql("source_fixture", """
select json_build_object(
 'columns',(select json_agg(json_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by c.relname,a.attnum) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind in('r','p') and a.attnum>0 and not a.attisdropped),
 'foreignKeys',(select coalesce(json_agg(json_build_object('table',c.relname,'name',k.conname,'columns',(select json_agg(a.attname order by key.ordinality) from unnest(k.conkey) with ordinality key(attnum,ordinality) join pg_attribute a on a.attrelid=c.oid and a.attnum=key.attnum),'referencedSchema',rn.nspname,'referencedRelation',r.relname,'referencedColumns',(select json_agg(a.attname order by key.ordinality) from unnest(k.confkey) with ordinality key(attnum,ordinality) join pg_attribute a on a.attrelid=r.oid and a.attnum=key.attnum)) order by c.relname,k.conname),'[]'::json) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace join pg_class r on r.oid=k.confrelid join pg_namespace rn on rn.oid=r.relnamespace where n.nspname='public' and k.contype='f'),
 'triggers',(select coalesce(json_agg(json_build_object('table',c.relname,'name',t.tgname,'function',p.proname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by c.relname,t.tgname),'[]'::json) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal),
 'constraints',(select json_agg(json_build_object('table',c.relname,'name',k.conname,'kind',k.contype,'definition',pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'functions',(select json_agg(json_build_object('name',p.proname,'arguments',pg_get_function_arguments(p.oid),'inputArguments',(select coalesce(json_agg(json_build_object('name',p.proargnames[arg.ordinality::integer],'type',format_type(arg.type_oid,null),'hasDefault',arg.ordinality>p.pronargs-p.pronargdefaults) order by arg.ordinality),'[]'::json) from unnest(p.proargtypes::oid[]) with ordinality arg(type_oid,ordinality)),'identityArguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),'strict',p.proisstrict,'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl) order by p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
 'enums',(select json_agg(json_build_object('type',t.typname,'label',e.enumlabel,'sort',e.enumsortorder) order by t.typname,e.enumsortorder) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='public'));
"""))
    (output / "actual-schema-catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")
    runtime_path = output / "typegen-runtime.json"
    runtime = json.loads(runtime_path.read_text())
    runtime["catalogSha256"] = hashlib.sha256((output / "actual-schema-catalog.json").read_bytes()).hexdigest()
    runtime_path.write_text(json.dumps(runtime, indent=2) + "\n")
    checked = subprocess.run(["node", "scripts/verify-continuous-database-types.cjs", str(actual)], cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=60)
    (output / "type-mapping-verification.log").write_text(checked.stdout + checked.stderr)
    if checked.returncode:
        raise RuntimeError("Candidate database mappings differ from actual isolated PG17 types; see type mapping artifact")
