import asyncio, json, os
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "entries.json"), encoding="utf-8"))
ents = d["entries"] if isinstance(d, dict) else d
OUT = os.path.join(HERE, "audio")
os.makedirs(OUT, exist_ok=True)
VOICE = "zh-CN-YunyangNeural"  # 央视/新闻主播男声，最接近白岩松

async def main():
    done = 0
    for e in ents:
        pid = str(e["id"])
        f = os.path.join(OUT, pid + ".mp3")
        if os.path.exists(f) and os.path.getsize(f) > 500:
            continue
        try:
            tts = edge_tts.Communicate(e["term"], VOICE, rate="+0%")
            await tts.save(f)
            done += 1
            if done % 20 == 0:
                print("generated", done, "files", flush=True)
        except Exception as ex:
            print("ERR", pid, ex, flush=True)
    print("AUDIO_DONE total_ready=", len(os.listdir(OUT)), flush=True)

asyncio.run(main())
