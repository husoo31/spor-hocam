#!/bin/bash
# Kendini onaran izleyici (dakikada bir, cron): uygulama konteyneri yoksa/sağlıksızsa yeniden başlatır.
# Yalnızca bu uygulamanın konteynerine dokunur; Traefik/Coolify/diğer servislere dokunmaz. Dağıtım (iki konteyner) sırasında müdahale etmez.
PREFIX=${SPOR_PREFIX:-0ahuu2n123x3uxyimrtm4o9d}
URL=${SPOR_URL:-https://enesdokay.dynvel.com/api/health}
LOG=${SPOR_LOG:-$HOME/spor-ops.log}
STATE=${SPOR_STATE:-/tmp/spor-watchdog.state}
log() { echo "$(date -Is) [izleyici] $*" >> "$LOG"; }
[ -f "$LOG" ] && [ "$(stat -c %s "$LOG")" -gt 1048576 ] && tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
[ -f "$STATE" ] && read -r PF CF < "$STATE"; PF=${PF:-0}; CF=${CF:-0}   # PF: art arda genel adres hatası, CF: art arda sağlıksız konteyner
ALL=$(docker ps -a --filter "name=$PREFIX" --format '{{.ID}} {{.Status}}')
RUN=$(docker ps --filter "name=$PREFIX" -q | wc -l)
[ "$RUN" -gt 1 ] && exit 0                       # dağıtım sürüyor: iki konteyner var
C=$(docker ps -a --filter "name=$PREFIX" -q | head -1)
if [ -z "$C" ]; then log "konteyner YOK; Coolify'dan yeniden dağıtım gerekir (müdahale edilmedi)"; exit 1; fi
STATUS=$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$C" 2>/dev/null)
if [ "$STATUS" = "running|healthy" ] || [ "$STATUS" = "running|none" ] || [ "$STATUS" = "running|starting" ]; then CF=0
else
  CF=$((CF+1))
  if [ "$CF" -ge 2 ]; then log "konteyner durumu '$STATUS' ($CF dakikadır): yeniden başlatılıyor"; docker restart "$C" >/dev/null 2>&1 && log "yeniden başlatıldı" || log "yeniden başlatma BAŞARISIZ"; CF=0; fi
fi
# genel adres (Traefik, DNS, sertifika dahil) kontrolü: uygulama sağlıklı ama dışarıdan ulaşılamıyorsa yalnızca kaydet
if curl -fsS --max-time 10 -o /dev/null "$URL" 2>/dev/null; then [ "$PF" -ge 3 ] && log "genel adres düzeldi"; PF=0
else PF=$((PF+1)); [ "$PF" -eq 3 ] && log "UYARI: genel adres $PF dakikadır yanıt vermiyor ($URL); uygulama konteyneri: $STATUS"; fi
echo "$PF $CF" > "$STATE"
