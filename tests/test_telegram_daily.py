import importlib.util
from datetime import date, datetime
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

M = Path(__file__).resolve().parents[1] / 'scripts' / 'telegram_daily.py'
spec = importlib.util.spec_from_file_location('telegram_daily', M)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class LogicTests(unittest.TestCase):
    def test_autumn_dst(self):
        h=mod.hourly_labels(date(2026,10,25))
        self.assertEqual(len(h),25)
        self.assertEqual(h.count(2),2)
        self.assertEqual(h[2:5], [2,2,3])
    def test_spring_dst(self):
        h=mod.hourly_labels(date(2027,3,28))
        self.assertEqual(len(h),23)
        self.assertNotIn(2,h)
    def test_normal_day(self):
        h=mod.hourly_labels(date(2026,10,24))
        self.assertEqual(h,list(range(24)))
    def test_reject_wrong_date(self):
        j={'fecha':'2026-10-23','zona':'PCB','horas':[{'hora':h,'pvpc':.1} for h in range(24)]}
        with self.assertRaises(ValueError): mod.parse_preciluz(j,date(2026,10,24))
    def test_reject_wrong_slot_count(self):
        j={'fecha':'2026-10-25','zona':'PCB','horas':[{'hora':h,'pvpc':.1} for h in range(24)]}
        with self.assertRaises(ValueError): mod.parse_preciluz(j,date(2026,10,25))
    def test_reject_nonfinite(self):
        r=[(h,.1) for h in range(24)];r[3]=(3,float('nan'))
        with self.assertRaises(ValueError): mod.normalize_raw(r,date(2026,10,24))
    def test_reject_out_of_order(self):
        r=[(h,.1) for h in range(24)];r[5],r[6]=r[6],r[5]
        with self.assertRaises(ValueError): mod.normalize_raw(r,date(2026,10,24))
    def test_report_includes_attribution(self):
        r=[(h,.1+h/1000) for h in range(24)]
        m=mod.message_for(date(2026,10,24),r,'Preciluz')
        self.assertIn('MAÑANA 24/10/2026',m)
        self.assertIn('REE/ESIOS',m)
        self.assertIn('HORAS MÁS CARAS',m)
        self.assertLess(len(m),4096)
    def test_no_send_outside_window(self):
        with patch.object(mod,'fetch_prices') as f:
            rc=mod.main([], datetime(2026,10,24,15,0,tzinfo=ZoneInfo('Europe/Madrid')))
        self.assertEqual(rc,0);f.assert_not_called()
    def test_dry_run_never_sends(self):
        r=[(h,.1+h/1000) for h in range(24)]
        with patch.object(mod,'fetch_prices',return_value=(r,'Preciluz')),patch.object(mod,'send_to_telegram') as f:
            rc=mod.main(['--dry-run'],datetime(2026,10,24,9,0,tzinfo=ZoneInfo('Europe/Madrid')))
        self.assertEqual(rc,0);f.assert_not_called()
    def test_idempotence(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'state.json';p.write_text('{"last_sent_for":"2026-10-25"}')
            with patch.object(mod,'STATE',p),patch.object(mod,'fetch_prices') as f:
                rc=mod.main([],datetime(2026,10,24,20,40,tzinfo=ZoneInfo('Europe/Madrid')))
            self.assertEqual(rc,0);f.assert_not_called()
    def test_message_send_then_marked(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'state.json';p.write_text('{"last_sent_for": null}')
            r=[(h,.1+h/1000) for h in mod.hourly_labels(date(2026,10,26))]
            with patch.object(mod,'STATE',p),patch.object(mod,'fetch_prices',return_value=(r,'Preciluz')),patch.object(mod,'send_to_telegram') as f,patch.dict('os.environ',{'TELEGRAM_BOT_TOKEN':'SAMPLE','TELEGRAM_CHANNEL_ID':'@fakechannel'}):
                rc=mod.main([],datetime(2026,10,25,20,40,tzinfo=ZoneInfo('Europe/Madrid')))
            self.assertEqual(rc,0);f.assert_called_once();self.assertTrue(mod.sent_already(date(2026,10,26)) is False) # state patch ended
            self.assertIn('2026-10-26',p.read_text())

if __name__=='__main__':unittest.main()