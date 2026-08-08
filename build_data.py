# -*- coding: utf-8 -*-
"""解析《200个绝美的诗词成语.md》-> 结构化数据 (data.js + entries.json)"""
import re, json, os

SRC = r"D:\WorkBuddy\CQ\200个绝美的诗词成语.md"
OUT_DIR = r"D:\WorkBuddy\CQ\每天进步一点点"
HAN = re.compile(r"[\u4e00-\u9fff]")

COLLECTIONS = [{"id": "cy", "name": "200个绝美的诗词成语"}]

def cat_name(h2):
    # "## 一、光阴如流水·岁月不等人" -> "光阴如流水"
    t = h2.replace("##", "").strip()
    t = re.sub(r"^[一二三四五六七八九十]+、", "", t)  # 去 "一、"
    if "·" in t:
        t = t.split("·", 1)[0]
    return t.strip()

entry_re = re.compile(r"\*\*【(\d+)】(.*?)——(.*?)\*\*")

def main():
    text = open(SRC, encoding="utf-8").read()
    lines = text.split("\n")
    entries = []
    cur_cat = ""
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.startswith("## "):
            cur_cat = cat_name(line)
            i += 1
            continue
        m = entry_re.search(line)
        if m:
            eid = int(m.group(1))
            term = m.group(2).strip()
            source = m.group(3).strip()
            hanchars = HAN.findall(term)
            # 收集释义：后续非空行，直到下一个条目/标题/分隔
            meaning_lines = []
            j = i + 1
            while j < n:
                nl = lines[j].strip()
                if nl.startswith("**【") or nl.startswith("## ") or nl == "---":
                    break
                if nl:
                    meaning_lines.append(nl)
                j += 1
            meaning = " ".join(meaning_lines).strip()
            entries.append({
                "id": eid,
                "collection": "cy",
                "term": term,
                "chars": len(hanchars),
                "pinyin": "",
                "source": source,
                "meaning": meaning,
                "category": cur_cat,
            })
            i = j
            continue
        i += 1

    entries.sort(key=lambda e: e["id"])
    # 校验 id 连续 1..200
    ids = [e["id"] for e in entries]
    print("解析条数:", len(entries))
    print("id范围:", ids[0], "~", ids[-1], "连续:", ids == list(range(1, len(entries)+1)))
    print("分类数:", len(set(e["category"] for e in entries)))
    print("样例:", json.dumps(entries[0], ensure_ascii=False))
    print("样例(八字):", json.dumps([e for e in entries if e["chars"]==8][0], ensure_ascii=False))

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "entries.json"), "w", encoding="utf-8") as f:
        json.dump({"collections": COLLECTIONS, "entries": entries}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT_DIR, "data.js"), "w", encoding="utf-8") as f:
        f.write("// 自动生成，勿手改。前端通过 <script src=\"data.js\"> 引入。\n")
        f.write("window.COLLECTIONS = " + json.dumps(COLLECTIONS, ensure_ascii=False) + ";\n")
        f.write("window.ENTRIES = " + json.dumps(entries, ensure_ascii=False) + ";\n")
    print("已写出 data.js / entries.json")

if __name__ == "__main__":
    main()
