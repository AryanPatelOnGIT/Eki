"""Capture serial evidence without sending device commands or asserting DTR/RTS."""
import argparse
import json
import math
import time
from pathlib import Path

def capture(port, baud, duration, output, *, stop_file=None, serial_module=None,
            clock=time, retry_seconds=1):
    """Retain exact bytes, monotonic chunk times and disconnects without resets."""
    if not math.isfinite(duration) or duration < 0 or baud <= 0 or not 0 < retry_seconds <= 5:
        raise ValueError("Duration must be finite and nonnegative; baud and retry delay must be positive.")
    if duration == 0 and not stop_file:
        raise ValueError("Duration zero requires --stop-file for END-controlled capture.")
    if serial_module is None:
        import serial as serial_module
    output = Path(output)
    raw_path = Path(str(output) + ".raw.bin")
    event_path = Path(str(output) + ".events.jsonl")
    for file in (output, raw_path, event_path):
        if file.exists():
            raise FileExistsError(str(file))
    output.parent.mkdir(parents=True, exist_ok=True)
    deadline = clock.monotonic() + duration if duration else math.inf
    line_count = byte_count = errors = 0
    pending = bytearray()
    device = serial_module.Serial(port=None, baudrate=baud, timeout=0.25)
    device.dtr = False
    device.rts = False
    device.port = port
    with output.open("x", encoding="utf-8", newline="\n") as trace, \
         raw_path.open("xb", buffering=0) as raw, \
         event_path.open("x", encoding="utf-8", buffering=1) as events:
        def event(name, **fields):
            events.write(json.dumps(dict(event=name, hostNs=clock.time_ns(),
                monotonicNs=int(clock.monotonic() * 1e9), **fields)) + "\n")
        def flush_partial(reason):
            nonlocal line_count
            if pending:
                trace.write(f"{clock.time_ns() // 1_000_000} " +
                    pending.decode("utf-8", errors="replace").rstrip("\r") + "\n")
                trace.flush()
                event("partial_line", bytes=len(pending), reason=reason)
                pending.clear()
                line_count += 1
        event("capture_start", port=port, baud=baud, durationSeconds=duration)
        retry_at = 0
        try:
            while clock.monotonic() < deadline and not (stop_file and Path(stop_file).exists()):
                if clock.monotonic() < retry_at:
                    clock.sleep(min(0.25, max(0, deadline - clock.monotonic())))
                    continue
                try:
                    if not device.is_open:
                        device.open()
                        event("port_open")
                    chunk = device.read(max(1, min(device.in_waiting, 65536)))
                except (serial_module.SerialException, OSError) as error:
                    errors += 1
                    event("serial_error", errorType=type(error).__name__)
                    flush_partial("disconnect")
                    device.close()
                    retry_at = clock.monotonic() + retry_seconds
                    continue
                # Storage errors must fail the recorder, never masquerade as a
                # USB disconnect while bytes are silently lost.
                if not chunk:
                    continue
                offset = raw.tell()
                if raw.write(chunk) != len(chunk):
                    raise OSError("Incomplete raw evidence write")
                event("chunk", offset=offset, length=len(chunk))
                byte_count += len(chunk)
                pending.extend(chunk)
                while b"\n" in pending:
                    end = pending.index(b"\n")
                    line = pending[:end].decode("utf-8", errors="replace").rstrip("\r")
                    del pending[:end + 1]
                    trace.write(f"{clock.time_ns() // 1_000_000} {line}\n")
                    line_count += 1
                trace.flush()
                if len(pending) >= 65536:
                    flush_partial("line_limit")
        finally:
            device.close()
            flush_partial("capture_end")
            event("capture_end", lines=line_count, bytes=byte_count, serialErrors=errors)
    return dict(lines=line_count, bytes=byte_count, serialErrors=errors,
        output=str(output), raw=str(raw_path), events=str(event_path))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--duration", type=int, required=True,
                        help="Seconds; zero records until --stop-file exists.")
    parser.add_argument("--out", required=True)
    parser.add_argument("--stop-file", help="Stop gracefully when this file exists.")
    args = parser.parse_args()
    try:
        result = capture(args.port, args.baud, args.duration, args.out, stop_file=args.stop_file)
    except (ValueError, FileExistsError) as error:
        parser.error(str(error))
    print(json.dumps(result))

if __name__ == "__main__":
    main()
