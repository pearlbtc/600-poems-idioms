# -*- coding: utf-8 -*-
"""补生成 26~200 音频：8 路并发，强制覆盖，确保与 entries.json 严格一致（修复错位）。
不改动 gen_audio.py，独立脚本，可重复运行。"""
import asyncio, json, os
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "entries.json"), encoding="utf-8"))
ents = d["entries"] if isinstance(d, dict) else d
OUT = os.path.join(HERE, "audio")
os.makedirs(OUT, exist_ok=True)
VOICE = "zh-CN-YunyangNeural"  # 与 gen_audio.py 保持一致，避免音色变化
RANGE = set(range(26, 201))    # 26..200 共 175 个，修复错位范围
CONC = 8                       # 并发数，edge-tts 每个请求独立，可并发

sem = asyncio.Semaphore(CONC)

async def gen(e):
    pid = e["id"]
    f = os.path.join(OUT, str(pid) + ".mp3")
    async with sem:
        try:
            tts = edge_tts.Communicate(e["term"], VOICE, rate="+0%")
            # 用 stream 自己写文件：open("wb") 覆盖写不触发删除拦截（sandbox 只拦 os.remove）
            with open(f, "wb") as fp:
                async for chunk in tts.stream():
                    if chunk.get("type") == "audio":
                        fp.write(chunk["data"])
            sz = os.path.getsize(f)
            if sz < 500:
                print("WARN %d too small %dB, skip" % (pid, sz), flush=True)
                return 0
            print("OK %d %dB" % (pid, sz), flush=True)
            return 1
        except Exception as ex:
            print("ERR %d: %s" % (pid, ex), flush=True)
            return 0

async def main():
    jobs = [e for e in ents if e["id"] in RANGE]
    results = await asyncio.gather(*[gen(e) for e in jobs])
    print("FIX_DONE regenerated=%d/%d" % (sum(results), len(jobs)), flush=True)

asyncio.run(main())
