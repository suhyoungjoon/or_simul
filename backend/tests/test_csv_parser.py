import os

from ingestion.csv_parser import parse_workers_csv

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def test_parse_workers_csv_returns_list_of_dicts():
    rows = parse_workers_csv(os.path.join(FIXTURE_DIR, "workers_sample.csv"))

    assert len(rows) == 2
    assert rows[0]["id"] == 1
    assert rows[0]["name"] == "김민준"
    assert rows[0]["can_iptv"] is True
    assert rows[1]["can_iptv"] is False


def test_parse_workers_csv_skips_row_with_invalid_id(tmp_path):
    bad_csv = tmp_path / "bad.csv"
    bad_csv.write_text(
        "id,name,x,y,color,can_iptv,as_rate,region\n"
        "not-a-number,깨진행,0,0,#000,true,0,A\n"
        "3,정상행,0.1,0.2,#111,true,0.05,A\n",
        encoding="utf-8",
    )

    rows = parse_workers_csv(str(bad_csv))

    assert len(rows) == 1
    assert rows[0]["id"] == 3
