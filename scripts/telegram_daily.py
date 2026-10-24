#!/usr/bin/env python3
"""PVPC tomorrow report for opt-in Telegram channel. stdlib only, cost=0.

Never expose BOT_TOKEN or channel ID in public source; use GitHub Actions secrets.
Never send if data are absent, date does not match, or hourly slots do not match Madrid DST.
"""
from __future__ import annotations
import argparse
from datetime import date, datetime, timedelta, time, timezone
import json
import math
import os
from pathlib import Path
import sys
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")
UTC = timezone.utc
SOURCE_PRIMARY = "https://preciluz.com/datos/precio-manana.json"
SOURCE_SECONDARY = "https://energialert.com/v1/prices?"  # public free endpoint
STATE = Path(__file__).resolve().parent.parent / ".delivery-state.json"


def hourly_labels(d: date):
    """Ordered local-hour labels for 23/24/25-hour days (UTC walk)."""
    start = datetime.combine(d, time.min, MADRID).astimezone(UTC)
    stop = datetime.combine(d + timedelta(days=1), time.min, MADRID).astimezone(UTC)
    answer = []
    step = start
    while step < stop:
        answer.append(step.astimezone(MADRID).hour)
        step += timedelta(hours=1)
    return answer


def normalize_raw(rows, d):
    expected = hourly_labels(d)
    if not isinstance(rows, list) or len(rows) != len(expected):
        raise ValueError(f"Datos incompletos para {d}: se esperan {len(expected)} tramos")
    normalized = []
    for i, row in enumerate(rows):
        try:
            h = int(row[0]); p = float(row[1])
        except (IndexError, ValueError, TypeError) as err:
            raise ValueError("Hora o precio inválido") from err
        if h != expected[i] or not math.isfinite(p) or not -1 <= p <= 3:
            raise ValueError("Horas desordenadas o precios fuera de rango")
        normalized.append((h, p))
    return normalized


def parse_preciluz(data, d):
    if data.get("fecha") != d.isoformat() or data.get("zona") != "PCB":
        raise ValueError("Fecha o zona de PVPC incorrecta")
    return normalize_raw([(r["hora"], r["pvpc"]) for r in data["horas"]], d)


def parse_energialert(data, d):
    obj = data.get("data", {})
    if data.get("success") is not True or obj.get("date") != d.isoformat() or not obj.get("published"):
        raise ValueError("Fecha no publicada")
    return normalize_raw([(datetime.fromisoformat(r["startsAt"]).hour, r["eurKwh"]) for r in obj["slots"]], d)


def get_json(url: str):
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "PrecioLuzCasa/1.5 (+Personal PVPC bot; no tracking)"})
    with urlopen(req, timeout=12) as response:
        return json.load(response)


def fetch_prices(d):
    sources = [("Preciluz · datos REE/ESIOS", SOURCE_PRIMARY, parse_preciluz),
               ("EnergiAlert · datos PVPC", SOURCE_SECONDARY + urlencode({"date": d.isoformat(), "market": "pvpc"}), parse_energialert)]
    errors=[]
    for label, url, parser in sources:
        try:
            return parser(get_json(url), d), label
        except (OSError, KeyError, TypeError, ValueError) as exc:
            errors.append(label + ': ' + type(exc).__name__)
    raise ValueError("No hay precios PVPC de mañana válidos. " + "; ".join(errors))


def euros(n):
    return f"{n:.5f}".replace('.', ',')


def slot_labels(rows):
    dups = {}
    allcounts = {}
    for h,p in rows: allcounts[h]=allcounts.get(h,0)+1
    out=[]
    for h,p in rows:
        dups[h] = dups.get(h,0)+1
        repeated = (f" ({dups[h]}.ª)" if allcounts[h]>1 else "")
        out.append((f"{h:02}:00–{(h+1)%24:02}:00"+repeated, p))
    return out


def message_for(d, rows, source):
    labels=slot_labels(rows)
    min_idxs=sorted(range(len(rows)), key=lambda i:rows[i][1])[:4]
    max_idxs=sorted(range(len(rows)), key=lambda i:rows[i][1], reverse=True)[:4]
    def best_block(hours):
        ranking=[]
        for i in range(len(rows)-hours+1):
            avg = sum(p for _,p in rows[i:i+hours])/hours
            ranking.append((avg,i))
        avg,i=min(ranking)
        return f"{labels[i][0].split('–')[0]}–{labels[i+hours-1][0].split('–')[1].split(' ')[0]} (media {euros(avg)} €/kWh)"
    def listing(indices):
        return "\n".join(f"• {labels[i][0]}: {euros(rows[i][1])} €/kWh" for i in indices)
    return (f"⚡ PRECIO LUZ CASA · MAÑANA {d.strftime('%d/%m/%Y')}\n"
            "PVPC · Península · energía sin impuestos\n\n"
            f"🟢 HORAS MÁS BARATAS\n{listing(min_idxs)}\n\n"
            f"✅ Lavadora/lavavajillas: mejor bloque de 2 h\n{best_block(2)}\n"
            f"✅ Para 3 horas continuas\n{best_block(3)}\n\n"
            f"🔴 HORAS MÁS CARAS: EVITAR\n{listing(max_idxs)}\n\n"
            f"Datos: {source}, a partir de REE/ESIOS.\n"
            "El precio mostrado no representa la factura completa ni las tarifas fijas.\n"
            "🔕 Para dejar de recibir estos avisos, abandona este canal de Telegram.")


def sent_already(d):
    try:
        return json.loads(STATE.read_text(encoding='utf-8')).get('last_sent_for') == d.isoformat()
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return False


def send_to_telegram(token, channel_id, msg):
    if not token or not channel_id:
        raise ValueError('Faltan secrets TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHANNEL_ID')
    if len(msg)>4096:
        raise ValueError('Telegram limita la longitud del mensaje a 4096 caracteres')
    payload=json.dumps({'chat_id':channel_id,'text':msg,'disable_web_page_preview':True,'allow_paid_broadcast':False}).encode('utf-8')
    req=Request('https://api.telegram.org/bot'+token+'/sendMessage', data=payload,
                headers={'Content-Type':'application/json'},method='POST')
    # Never print the URL or exception: it contains the secret bot token.
    try:
        with urlopen(req, timeout=16) as response:
            result=json.load(response)
    except Exception:
        raise RuntimeError('Falló Telegram; revisa configuración y permisos del bot (sin mostrar token)') from None
    if result.get('ok') is not True:
        raise RuntimeError('Telegram no confirmó la entrega del mensaje')


def main(argv=None, now=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--dry-run',action='store_true',help='Validar y generar informe, sin enviar')
    args=parser.parse_args(argv)
    now=now or datetime.now(MADRID)
    if not args.dry_run and not (time(20,30) <= now.time() <= time(22,0)):
        print('Fuera de la ventana de envío 20:30–22:00 Madrid; no se envía.')
        return 0
    tomorrow=now.date()+timedelta(days=1)
    if sent_already(tomorrow) and not args.dry_run:
        print('Informe de mañana ya enviado. Evitamos duplicados.')
        return 0
    try:
        rows,source=fetch_prices(tomorrow)
    except ValueError as err:
        print('No se envía: '+str(err))
        return 0 # el próximo intento programado reintentará
    msg=message_for(tomorrow,rows,source)
    if args.dry_run:
        print(msg)
        return 0
    try:
        send_to_telegram(os.getenv('TELEGRAM_BOT_TOKEN'), os.getenv('TELEGRAM_CHANNEL_ID'),msg)
    except (ValueError, RuntimeError) as err:
        print('No enviado: '+str(err),file=sys.stderr)
        return 1
    STATE.write_text(json.dumps({'last_sent_for':tomorrow.isoformat()},ensure_ascii=False)+'\n',encoding='utf-8')
    print('CONFIRMADO: enviado informe de '+str(tomorrow)+'. Estado actualizado.')
    return 0

if __name__=='__main__':
    sys.exit(main())