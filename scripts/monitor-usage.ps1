# monitor-usage.ps1 — Monitor de consumo Supabase (NO se commitea; local).
# Uso:  powershell -File scripts/monitor-usage.ps1
# Lee el PAT de .env.supabase (gitignored). No imprime el token.
$ErrorActionPreference = 'Stop'
$ref = 'ydqgkhrefetpfdrkyykx'
$pat = ((Get-Content 'X:\Codes\bitcoiner\.env.supabase' | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=' }) -split '=', 2)[1].Trim()

function Q($sql) {
  $b = '{"query":"' + $sql.Replace('"', '\"') + '"}'
  $by = [System.Text.Encoding]::UTF8.GetBytes($b)
  (Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
      -Headers @{Authorization = "Bearer $pat" } -ContentType 'application/json; charset=utf-8' -Body $by)
}

Write-Output "===== MONITOR CONSUMO SUPABASE — $(Get-Date -Format 'HH:mm:ss') ====="
Write-Output ''
Write-Output '--- Tablas en Realtime (cada escritura = mensajes) ---'
Q "select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename" | Format-Table -AutoSize

Write-Output '--- Escrituras/hora en tablas de realtime ---'
Q "select 'trades' t, count(*) n from trades where executed_at>now()-interval '1 hour' union all select 'wallets', count(*) from wallets where updated_at>now()-interval '1 hour' union all select 'bot_state', count(*) from bot_state where updated_at>now()-interval '1 hour' union all select 'news_signals', count(*) from news_signals where ts>now()-interval '1 hour'" | Format-Table -AutoSize

Write-Output '--- Tamano de la base ---'
Q "select pg_size_pretty(pg_database_size(current_database())) as db_size" | Format-Table -AutoSize

Write-Output '--- Filas por tabla (volumen) ---'
Q "select 'opportunities' t, count(*) n from opportunities union all select 'spread_history', count(*) from spread_history union all select 'trades', count(*) from trades" | Format-Table -AutoSize

Write-Output 'Tip: revisa el % real de Egress/Realtime en el dashboard de Supabase (tarda hasta 1h en refrescar).'
