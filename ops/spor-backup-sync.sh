#!/bin/bash
# Uygulamanın günlük yedeklerini (konteyner içi /data/backups) SUNUCU DİSKİNE kopyalar; konteyner/volume silinse bile kopya kalır.
# Her dosya açılıp bütünlük denetiminden geçirilir; son 30 yedek saklanır. Cron: 15 4 * * * ~/bin/spor-backup-sync.sh
PREFIX=${SPOR_PREFIX:-0ahuu2n123x3uxyimrtm4o9d}
DEST=${SPOR_BACKUP_DIR:-$HOME/spor-backups}
LOG=${SPOR_LOG:-$HOME/spor-ops.log}
NODE=${NODE_BIN:-$(command -v node || ls $HOME/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)}
log() { echo "$(date -Is) [yedek-senkron] $*" >> "$LOG"; }
mkdir -p "$DEST" && chmod 700 "$DEST"
C=$(docker ps -q --filter "name=$PREFIX" --filter health=healthy | head -1)
[ -z "$C" ] && { log "uygulama konteyneri sağlıklı değil, atlandı"; exit 1; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
docker cp "$C:/data/backups/." "$TMP/" 2>/dev/null || { log "konteynerde yedek klasörü yok (henüz yedek alınmamış olabilir)"; exit 1; }
n=0
for f in "$TMP"/spor-*.db; do
  [ -f "$f" ] || continue
  b=$(basename "$f"); [ -f "$DEST/$b" ] && continue
  if "$NODE" --disable-warning=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});process.exit(d.prepare('PRAGMA integrity_check').get().integrity_check==='ok'?0:1)" "$f" 2>/dev/null; then
    mv "$f" "$DEST/$b" && chmod 600 "$DEST/$b" && n=$((n+1)) && log "kopyalandı: $b"
  else log "BOZUK yedek atlandı: $b"; fi
done
ls -1t "$DEST"/spor-*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
[ "$n" -gt 0 ] || log "yeni yedek yok ($(ls "$DEST"/spor-*.db 2>/dev/null | wc -l) yedek saklı)"
