# Docker deployment

Upload docker-compose.yml to separate family-graph/ and family-graph-demo/ directories. Set ports to 12501:8080 for private use and 12502:8080 for demo. DEMO_READ_ONLY: "false" permits editing/import; "true" blocks writes.

Compose derives the project name from the directory. Keep distinct directory names; do not override both with the same project name. Keep only one Compose file in each directory.

Data lives beside the Compose file: data/sqlite/family-graph.sqlite and data/backups/. Both instances use the same image without bundled genealogy data.

## New empty installation

```sh
docker compose pull
docker compose run --rm app npm run db:init
docker compose up -d
```

Skip initialization when a database already exists. Updating images never requires reinitialization. The initializer refuses to overwrite an existing database.

Access http://SERVER_IP:12501 or :12502. Allow the selected port in the firewall. There is no login protection: anyone able to reach an editable instance can change data. Restrict source IPs while editing.

After importing JSON, set DEMO_READ_ONLY to "true" and run docker compose up -d. A plain restart does not apply environment changes.

## Existing named-volume deployment

Do not replace the configuration and initialize a new database. First stop the app using the OLD configuration and create a verified backup in a retained temporary container:

```sh
docker compose stop app
docker compose run --name family-graph-backup --entrypoint node app scripts/verify-sqlite-backup.js
```

Use the backup directory printed by the command. Create the destination data/sqlite/ and data/backups/ directories. Copy database.sqlite to data/sqlite/family-graph.sqlite using docker cp, and copy verification.json to data/backups/. Refuse to overwrite any existing destination database. The retained container allows copying the backup even if the old configuration has no backup bind mount.

Only after verifying the copied database, run docker compose down with the OLD configuration (without -v), replace the Compose file, and start the new project. The new directory-derived project name may differ from the old fixed name. Keep the old volume for rollback. No remote data migration is performed by editing this repository.

## Updates

```sh
docker compose pull
docker compose up -d
```

Build from the source root with docker buildx build --platform linux/amd64 --target production -f docker/Dockerfile -t YOUR_DOCKERHUB_USERNAME/family-graph:VERSION --push .
