#!/usr/bin/env python3
"""
Вокал + бит -> RoEx /recombine -> бесплатное 30-секундное превью MP3.

Установка:
    pip install roex-python requests

Запуск:
    export TONN_API_KEY=...
    python roex_recombine_preview.py vocal.wav beat.wav --genre TRAP
    python roex_recombine_preview.py vocal.wav beat.wav --genre POP -o preview.mp3

Отправка задачи и превью бесплатны. Полный мастер (WAV) этот скрипт
НЕ забирает: он стоит 250 кредитов.
"""

import argparse
import getpass
import logging
import os
import sys
from pathlib import Path

import requests
from roex_python import RoExClient
from roex_python.models.recombine import RecombineMusicalStyle, RecombineRequest
from roex_python.models.upload import UploadUrlRequest
from roex_python.utils import get_content_type

# Показывать текст ошибок от API (SDK пишет его в лог уровня WARNING).
logging.basicConfig(level=logging.WARNING, format="  API: %(message)s")

GENRES = ["TRAP", "HIPHOP_GRIME", "POP"]


def upload(client: RoExClient, path: Path) -> str:
    """Загружает локальный файл в хранилище RoEx и возвращает его readable URL."""
    # RoEx принимает только audio/wav, audio/mpeg, audio/flac (macOS угадывает audio/x-wav → 400).
    content_type = get_content_type(str(path))
    urls = client.upload.get_upload_url(
        UploadUrlRequest(filename=path.name, content_type=content_type)
    )
    if urls.error or not urls.signed_url or not urls.readable_url:
        raise RuntimeError(f"Не удалось получить ссылку для загрузки {path.name}: {urls.message}")

    with path.open("rb") as f:
        r = requests.put(urls.signed_url, data=f, headers={"Content-Type": content_type}, timeout=600)
    r.raise_for_status()
    print(f"  загружен: {path.name}")
    return urls.readable_url


def main() -> int:
    parser = argparse.ArgumentParser(description="RoEx recombine: вокал + бит -> превью MP3")
    parser.add_argument("vocal", type=Path, help="файл вокала (wav/flac/mp3)")
    parser.add_argument("beat", type=Path, help="файл бита / инструментала")
    parser.add_argument("--genre", choices=GENRES, help="жанр (если не указан — спросит)")
    parser.add_argument("-o", "--output", type=Path, help="куда сохранить превью (по умолчанию <вокал>_preview.mp3)")
    parser.add_argument("--timeout", type=int, default=900, help="сколько ждать готовности, сек (по умолчанию 900)")
    args = parser.parse_args()

    for p in (args.vocal, args.beat):
        if not p.is_file():
            print(f"Файл не найден: {p}", file=sys.stderr)
            return 1

    api_key = (os.environ.get("TONN_API_KEY") or "").strip()
    if not api_key or not api_key.isascii():
        # Пусто или там заглушка вроде «ваш_ключ» — спрашиваем ключ, ввод не отображается.
        api_key = getpass.getpass("TONN API ключ (ввод скрыт, вставьте и нажмите Enter): ").strip()
    if not api_key or not api_key.isascii():
        print("Нужен настоящий API-ключ из https://tonn-portal.roexaudio.com", file=sys.stderr)
        return 1

    genre = args.genre
    while genre not in GENRES:
        for i, g in enumerate(GENRES, 1):
            print(f"  {i}. {g}")
        choice = input("Выбери жанр (номер): ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(GENRES):
            genre = GENRES[int(choice) - 1]

    output = args.output or args.vocal.with_name(f"{args.vocal.stem}_preview.mp3")
    client = RoExClient(api_key=api_key)

    print("1/4 Загружаю файлы...")
    vocal_url = upload(client, args.vocal)
    beat_url = upload(client, args.beat)

    print(f"2/4 Отправляю в /recombine (жанр {genre})...")
    task = client.recombine.create_recombine(
        RecombineRequest(
            musical_style=RecombineMusicalStyle[genre],
            vocal_stem_url=vocal_url,
            backing_stem_url=beat_url,
        )
    )
    if task.error or not task.recombine_task_id:
        print(f"Ошибка создания задачи: {task.message}", file=sys.stderr)
        return 1
    print(f"  задача: {task.recombine_task_id}")

    print("3/4 Жду готовности (обычно пара минут)...")
    client.recombine.wait_for_recombine(task.recombine_task_id, poll_interval=10, timeout=args.timeout)

    print("4/4 Скачиваю бесплатное превью...")
    preview = client.recombine.retrieve_preview(task.recombine_task_id)
    if not preview.preview_url:
        print("API не вернул ссылку на превью", file=sys.stderr)
        return 1

    with requests.get(preview.preview_url, stream=True, timeout=300) as r:
        r.raise_for_status()
        with output.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 16):
                f.write(chunk)

    print(f"\nГотово: {output}")
    if preview.preview_start_seconds is not None:
        print(f"  превью начинается с {preview.preview_start_seconds:.1f} c трека (самая громкая часть)")
    if preview.measured_lufs_full is not None:
        print(f"  громкость полного трека: {preview.measured_lufs_full:.1f} LUFS")
    print(f"  ID задачи (для полного мастера за 250 кредитов): {task.recombine_task_id}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:  # noqa: BLE001
        print(f"Ошибка: {e}", file=sys.stderr)
        sys.exit(1)
