#!/usr/bin/env python3
"""Fetch news headlines from RSS/Atom feeds into one small JSON file for Jarvis.

Usage:  python scripts/fetch_news.py [feeds_json] [output_json]
Defaults: scripts/news_feeds.json  ->  site/news.json

Each topic in the feeds file lists one or more feed URLs. A feed that fails is
skipped (the build never fails because of news). Standard library only.
"""
import datetime
import email.utils
import json
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

KEEP = 8
UA = "Mozilla/5.0 (compatible; BrainGraphNews/1.0)"


def local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def clean(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()


def to_iso(raw):
    raw = (raw or "").strip()
    if not raw:
        return ""
    try:
        return email.utils.parsedate_to_datetime(raw).astimezone(datetime.timezone.utc).isoformat()
    except Exception:
        pass
    try:
        return datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(datetime.timezone.utc).isoformat()
    except Exception:
        return ""


def parse_feed(data):
    """Return [{title, link, source, published}] from RSS 2.0 or Atom bytes."""
    root = ET.fromstring(data)
    out = []
    for node in root.iter():
        if local(node.tag) not in ("item", "entry"):
            continue
        row = {"title": "", "link": "", "source": "", "published": ""}
        for ch in node:
            name = local(ch.tag)
            if name == "title":
                row["title"] = clean(ch.text)
            elif name == "link":
                row["link"] = (ch.text or "").strip() or ch.attrib.get("href", "")
            elif name in ("pubDate", "published", "updated", "date") and not row["published"]:
                row["published"] = to_iso(ch.text)
            elif name == "source":
                row["source"] = clean(ch.text)
        if row["title"]:
            out.append(row)
    return out


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def build(feeds):
    topics = {}
    for topic, urls in feeds.items():
        seen, rows = set(), []
        for url in urls:
            try:
                items = parse_feed(fetch(url))
            except Exception as e:  # skip a broken feed, keep the rest
                print(f"warning: {topic}: {url}: {e}", file=sys.stderr)
                continue
            for it in items:
                key = re.sub(r"\W+", "", it["title"].lower())[:60]
                if key in seen:
                    continue
                seen.add(key)
                if not it["source"]:
                    it["source"] = re.sub(r"^www\.", "", re.sub(r"^https?://([^/]+).*", r"\1", url))
                rows.append(it)
        rows.sort(key=lambda r: r["published"], reverse=True)
        topics[topic] = rows[:KEEP]
    return topics


def main():
    feeds_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "scripts/news_feeds.json")
    out_path = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "site/news.json")
    feeds = json.loads(feeds_path.read_text(encoding="utf-8"))
    topics = build(feeds)
    payload = {"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "topics": topics}
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print("news:", ", ".join(f"{t}={len(r)}" for t, r in topics.items()), "->", out_path)


if __name__ == "__main__":
    main()
