import asyncio
import json
import os
import sys

import edge_tts


async def synthesize(text, voice, rate, path):
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    with open(path, "wb") as handle:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                handle.write(chunk["data"])


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = "?"
        try:
            request = json.loads(line)
            request_id = request.get("id", "?")
            path = request["path"]
            os.makedirs(os.path.dirname(path), exist_ok=True)
            asyncio.run(synthesize(
                request["text"],
                request.get("voice", "zh-CN-XiaoyiNeural"),
                request.get("rate", "-8%"),
                path,
            ))
            print(json.dumps({"id": request_id, "ok": True, "path": path}), flush=True)
        except Exception as error:
            print(json.dumps({"id": request_id, "ok": False, "error": str(error)}), flush=True)


if __name__ == "__main__":
    main()
