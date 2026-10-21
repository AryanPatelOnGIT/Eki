"""Run capture-owned commands in fresh segments until an explicit STOP file.

Configuration is private JSON: run, cwd, workers {name: [argument, ...]}.
Arguments may contain {segment} and {stop_file}; no shell is invoked.
This does not launch or restart the application being observed.
"""
import argparse
import datetime as dt
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


def publish_status(path, data, *, clock=time, attempts=5):
    """A replace sharing violation is diagnostic loss, not worker failure.

    Other storage errors propagate. Never delete the last published status to
    work around Windows readers; consumers must check its timestamp.
    """
    temporary = path.with_suffix('.tmp')
    try:
        for attempt in range(attempts):
            try:
                temporary.write_text(json.dumps(data, indent=2), encoding='utf-8')
                temporary.replace(path)
                return True
            except PermissionError:
                if attempt + 1 < attempts:
                    clock.sleep(.05)
        return False
    finally:
        # A locked temporary file is safe to reuse next cycle as well.
        try:
            temporary.unlink(missing_ok=True)
        except PermissionError:
            pass


def supervise(config, *, clock=time, popen=subprocess.Popen,
              disk_usage=shutil.disk_usage, publisher=publish_status):
    run = Path(config['run']).resolve()
    cwd = Path(config['cwd']).resolve(strict=True)
    commands = config['workers']
    if not commands or any(not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}', name)
                           for name in commands):
        raise ValueError('Expected nonempty workers with simple lowercase names.')
    for command in commands.values():
        if not isinstance(command, list) or not command or any(
                not isinstance(arg, str) or not arg for arg in command):
            raise ValueError('Each worker requires a nonempty argument array.')
    grace = config.get('graceSeconds', 90)
    minimum = config.get('minimumFreeBytes', 1024 ** 3)
    if not isinstance(grace, (int, float)) or not math.isfinite(grace) or grace <= 0:
        raise ValueError('graceSeconds must be finite and positive.')
    if not isinstance(minimum, int) or minimum <= 0:
        raise ValueError('minimumFreeBytes must be positive.')
    # One supervisor per fresh run. Never reuse an old STOP or evidence folder.
    run.mkdir(parents=True, exist_ok=False)
    stop = run / 'STOP'
    workers = {name: dict(process=None, segment=0, failures=0, retryAt=0,
                          history=[]) for name in commands}
    reason = 'SUPERVISOR_ERROR'
    stopping = None
    forced = []
    begin = clock.monotonic()

    def event(kind, **fields):
        with (run / 'supervisor-events.jsonl').open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(dict(atUtc=dt.datetime.now(dt.timezone.utc).isoformat(),
                monotonicNs=int(clock.monotonic() * 1e9), event=kind, **fields)) + '\n')

    def publish(ended=False):
        data = dict(atUtc=dt.datetime.now(dt.timezone.utc).isoformat(),
            elapsedSeconds=clock.monotonic() - begin, mode='UNTIL_END',
            ended=ended, stopReason=reason if stopping is not None or ended else None,
            forcedTerminations=forced, workers={name: dict(
                segment=w['segment'], failures=w['failures'], history=w['history'],
                alive=w['process'] is not None and w['process'].poll() is None,
                pid=w['process'].pid if w['process'] else None) for name, w in workers.items()})
        if not publisher(run / 'recorder-status.json', data, clock=clock):
            event('status_publish_deferred', reason='PermissionError; workers continue')

    event('supervisor_start', mode='UNTIL_END', fixedDeadline=None)
    try:
        while True:
            if stopping is None:
                if stop.exists():
                    reason = 'END/STOP'
                    stopping = clock.monotonic()
                    event('stop_requested', reason=reason)
                elif disk_usage(run).free < minimum:
                    reason = 'CRITICAL_STORAGE'
                    stop.touch(exist_ok=True)
                    stopping = clock.monotonic()
                    event('stop_requested', reason=reason)
            for name, w in workers.items():
                process = w['process']
                if process is not None and process.poll() is not None and w['history'][-1]['exitCode'] is None:
                    w['history'][-1]['exitCode'] = process.returncode
                    event('worker_exited', worker=name, segment=w['segment'], exitCode=process.returncode)
                    w['failures'] += 1
                    w['retryAt'] = clock.monotonic() + min(60, 2 ** min(6, w['failures']))
                if stopping is None and (process is None or process.poll() is not None) and clock.monotonic() >= w['retryAt']:
                    w['segment'] += 1
                    segment = run / 'segments' / name / f"{w['segment']:04d}"
                    segment.mkdir(parents=True, exist_ok=False)
                    argv = [arg.replace('{segment}', str(segment)).replace('{stop_file}', str(stop))
                            for arg in commands[name]]
                    record = dict(segment=w['segment'], exitCode=None)
                    w['history'].append(record)
                    # Evidence storage failures must not be disguised as a
                    # retryable process launch failure or orphan an owned child.
                    with (segment / 'stdout.log').open('xb') as out, (segment / 'stderr.log').open('xb') as err:
                        try:
                            w['process'] = popen(argv, cwd=cwd, stdin=subprocess.DEVNULL,
                                stdout=out, stderr=err, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                        except OSError as error:
                            w['process'] = None
                            record['exitCode'] = -1
                            w['failures'] += 1
                            w['retryAt'] = clock.monotonic() + min(60, 2 ** min(6, w['failures']))
                            event('worker_launch_failed', worker=name, segment=w['segment'], errorType=type(error).__name__)
                    if w['process'] is not None:
                        event('worker_started', worker=name, segment=w['segment'], pid=w['process'].pid)
            publish()
            if stopping is not None:
                if all(w['process'] is None or w['process'].poll() is not None for w in workers.values()):
                    break
                if clock.monotonic() - stopping >= grace:
                    break
            clock.sleep(.25)
    finally:
        stop_error = None
        try:
            stop.touch(exist_ok=True)
        except OSError as error:
            stop_error = error
        for name, w in workers.items():
            process = w['process']
            if process is not None:
                if process.poll() is None:
                    forced.append(dict(worker=name, pid=process.pid))
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                w['history'][-1]['exitCode'] = process.returncode
        if stop_error is not None:
            raise stop_error
        for termination in forced:
            event('forced_worker_termination', **termination)
        event('supervisor_end', reason=reason, forced=forced)
        publish(ended=True)
    return 0 if reason == 'END/STOP' and not forced and all(
        w['history'] and w['history'][-1]['exitCode'] == 0 for w in workers.values()) else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, help='Private JSON command manifest.')
    args = parser.parse_args()
    return supervise(json.loads(Path(args.config).read_text(encoding='utf-8-sig')))


if __name__ == '__main__':
    sys.exit(main())
