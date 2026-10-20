"""Disposable serial/archival fault tests; no pySerial or hardware is required."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

def module(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

serial_capture = module("capture-serial")
archive = module("archive-field-evidence")

class Clock:
    value = 0
    def monotonic(self): return self.value
    def time_ns(self): return int((1_000 + self.value) * 1e9)
    def sleep(self, duration): self.value += duration

class SerialError(OSError): pass

class Device:
    is_open = False
    in_waiting = 0
    opens = 0
    def __init__(self, clock, chunks): self.clock, self.chunks = clock, iter(chunks)
    def open(self):
        assert self.dtr is False and self.rts is False
        self.is_open = True
        self.opens += 1
    def close(self): self.is_open = False
    def read(self, size):
        self.clock.value += .1
        chunk = next(self.chunks, b"")
        if isinstance(chunk, Exception): raise chunk
        return chunk

class CaptureTests(unittest.TestCase):
    def capture(self, folder, chunks, **kwargs):
        clock = Clock()
        device = Device(clock, chunks)
        def construct(**args):
            self.assertIsNone(args['port'])
            return device
        result = serial_capture.capture("fake", 115200, 2, folder / 'capture.log',
            clock=clock, serial_module=SimpleNamespace(Serial=construct, SerialException=SerialError), **kwargs)
        return result, device

    def test_fragmented_bytes_are_exact_and_chunk_offsets_cover_raw(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            chunks = [b'first\r', b'\nsec\xff', b'ond\npartial']
            result, device = self.capture(p, chunks)
            self.assertEqual(Path(result['raw']).read_bytes(), b''.join(chunks))
            events = [json.loads(x) for x in Path(result['events']).read_text().splitlines()]
            spans = [x for x in events if x['event'] == 'chunk']
            self.assertEqual([(x['offset'], x['length']) for x in spans], [(0, 6), (6, 5), (11, 11)])
            self.assertEqual(events[-1]['event'], 'capture_end')
            self.assertFalse(device.is_open)
            self.assertEqual(result['lines'], 3)

    def test_disconnect_does_not_join_partial_lines_across_reconnect(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            result, device = self.capture(p, [b'old', SerialError('sensitive OS text'), b'new\n'])
            text = p.joinpath('capture.log').read_text()
            self.assertIn('old\n', text)
            self.assertIn('new\n', text)
            self.assertNotIn('oldnew', text)
            self.assertEqual(device.opens, 2)
            self.assertEqual(result['serialErrors'], 1)
            self.assertNotIn('sensitive OS text', Path(result['events']).read_text())

    def test_stop_file_prevents_open_and_overwrite_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            p.joinpath('STOP').touch()
            result, device = self.capture(p, [], stop_file=p/'STOP')
            self.assertEqual(device.opens, 0)
            self.assertEqual(result['bytes'], 0)
            with self.assertRaises(FileExistsError): self.capture(p, [b'replacement'])
            self.assertEqual(Path(result['raw']).read_bytes(), b'')

    def test_storage_failure_propagates_instead_of_retrying_serial(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            original_open = Path.open
            class FailedStorage:
                def __init__(self, stream): self.stream = stream
                def __enter__(self): return self
                def __exit__(self, *args): self.stream.close()
                def tell(self): return 0
                def write(self, chunk): raise OSError("simulated storage full")
            def opened(file, *args, **kwargs):
                stream = original_open(file, *args, **kwargs)
                return FailedStorage(stream) if file.name.endswith('.raw.bin') else stream
            with patch.object(Path, 'open', opened), self.assertRaisesRegex(OSError, 'storage full'):
                self.capture(p, [b'original bytes'])
            events = p.joinpath('capture.log.events.jsonl').read_text()
            self.assertNotIn('serial_error', events)

    def test_short_raw_write_fails_without_claiming_a_complete_chunk(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            original_open = Path.open
            class ShortStorage:
                def __init__(self, stream): self.stream = stream
                def __enter__(self): return self
                def __exit__(self, *args): self.stream.close()
                def tell(self): return self.stream.tell()
                def write(self, chunk): return self.stream.write(chunk[:1])
            def opened(file, *args, **kwargs):
                stream = original_open(file, *args, **kwargs)
                return ShortStorage(stream) if file.name.endswith('.raw.bin') else stream
            with patch.object(Path, 'open', opened), self.assertRaisesRegex(OSError, 'Incomplete raw evidence write'):
                self.capture(p, [b'original bytes'])
            events = [json.loads(line) for line in p.joinpath('capture.log.events.jsonl').read_text().splitlines()]
            self.assertFalse(any(event['event'] in ('chunk', 'serial_error') for event in events))
            self.assertEqual(p.joinpath('capture.log.raw.bin').read_bytes(), b'o')

    def test_damaged_no_newline_stream_is_retained_and_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            result, _ = self.capture(p, [b'x' * 65536, b'end'])
            self.assertEqual(Path(result['raw']).stat().st_size, 65539)
            self.assertIn('line_limit', Path(result['events']).read_text())

class ArchiveTests(unittest.TestCase):
    def test_nested_files_verified_and_explicit_exclusions_recorded(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory); source = p/'evidence'; source.mkdir()
            (source/'nested').mkdir(); (source/'nested'/'serial.bin').write_bytes(b'\xff\x00capture')
            (source/'supervisor.log').write_text('open log')
            result = archive.archive_evidence(source, p/'capture.zip', exclude=['supervisor.log'])
            self.assertEqual(result['verifiedFiles'], 1)
            self.assertTrue(result['everyEvidenceSha256Verified'])
            with zipfile.ZipFile(p/'capture.zip') as bundle:
                manifest = json.loads(bundle.read('SHA256SUMS.json'))
                self.assertEqual(manifest['excluded'], ['supervisor.log'])
                self.assertEqual(bundle.read('nested/serial.bin'), b'\xff\x00capture')
            self.assertFalse(p.joinpath('capture.zip.partial').exists())
            with self.assertRaises(FileExistsError): archive.archive_evidence(source, p/'capture.zip')

    def test_existing_checksum_is_preserved_without_publishing_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory); source = p/'evidence'; source.mkdir()
            (source/'raw').write_bytes(b'evidence')
            checksum = p/'capture.zip.sha256'; checksum.write_text('prior evidence checksum')
            with self.assertRaises(FileExistsError): archive.archive_evidence(source, p/'capture.zip')
            self.assertEqual(checksum.read_text(), 'prior evidence checksum')
            self.assertFalse(p.joinpath('capture.zip').exists())
            self.assertFalse(p.joinpath('capture.zip.partial').exists())

    def test_checksum_created_during_publication_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory); source = p/'evidence'; source.mkdir()
            (source/'raw').write_bytes(b'evidence')
            original = archive.os.link
            def publish(*args, **kwargs):
                (p/'capture.zip.sha256').write_text('concurrent evidence checksum')
                return original(*args, **kwargs)
            with patch.object(archive.os, 'link', publish), self.assertRaises(FileExistsError):
                archive.archive_evidence(source, p/'capture.zip')
            self.assertEqual(p.joinpath('capture.zip.sha256').read_text(), 'concurrent evidence checksum')
            with zipfile.ZipFile(p/'capture.zip') as bundle:
                self.assertIsNone(bundle.testzip())
                self.assertEqual(bundle.read('raw'), b'evidence')

    def test_archive_inside_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory); (p/'raw').write_text('evidence')
            with self.assertRaises(ValueError): archive.archive_evidence(p, p/'capture.zip')

    def test_mutated_source_never_publishes_a_verified_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory); source = p/'evidence'; source.mkdir(); raw = source/'raw'
            raw.write_text('original')
            original = zipfile.ZipFile.write
            def mutate(bundle, file, *args, **kwargs):
                raw.write_text('changed during archive')
                return original(bundle, file, *args, **kwargs)
            with patch.object(zipfile.ZipFile, 'write', mutate), self.assertRaises(ValueError):
                archive.archive_evidence(source, p/'capture.zip')
            self.assertFalse(p.joinpath('capture.zip').exists())
            self.assertTrue(p.joinpath('capture.zip.partial').exists())

if __name__ == '__main__': unittest.main()
