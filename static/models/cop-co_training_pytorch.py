from __future__ import annotations

import argparse
import shutil
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from PIL import Image
from ultralytics import YOLO

CLASSES = ["cop", "copcar", "badge", "logo"]
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def resolve_existing(*candidates: Path) -> Path:
    for path in candidates:
        if path.exists():
            return path.resolve()
    return candidates[0].resolve()


def index_images(voc_dir: Path) -> dict[str, Path]:
    """Map lowercase stem -> image path for a flat VOC folder."""
    by_stem: dict[str, Path] = {}
    for path in voc_dir.iterdir():
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
            by_stem[path.stem.lower()] = path
    return by_stem


def find_image(voc_dir: Path, filename: str | None, xml_stem: str, by_stem: dict[str, Path]) -> Path | None:
    if filename:
        direct = voc_dir / Path(filename).name
        if direct.exists():
            return direct
        stem = Path(filename).stem.lower()
        if stem in by_stem:
            return by_stem[stem]
    return by_stem.get(xml_stem.lower())


def convert_voc_split(voc_dir: Path, out_images: Path, out_labels: Path) -> int:
    """Convert a flat Pascal VOC folder (images + XMLs) to YOLO txt labels."""
    voc_dir = voc_dir.resolve()
    if not voc_dir.is_dir():
        print(f"ERROR: VOC directory does not exist: {voc_dir}")
        return 0

    out_images.mkdir(parents=True, exist_ok=True)
    out_labels.mkdir(parents=True, exist_ok=True)

    xml_paths = sorted(voc_dir.glob("*.xml"))
    by_stem = index_images(voc_dir)
    print(
        f"Scanning {voc_dir}: {len(xml_paths)} XML(s), {len(by_stem)} image(s)"
    )

    skips: Counter[str] = Counter()
    unknown_labels: Counter[str] = Counter()
    count = 0

    for xml_path in xml_paths:
        try:
            root = ET.parse(xml_path).getroot()
        except ET.ParseError as exc:
            skips["parse_error"] += 1
            print(f"skip (parse error): {xml_path.name}: {exc}")
            continue

        image_path = find_image(
            voc_dir,
            root.findtext("filename"),
            xml_path.stem,
            by_stem,
        )
        if image_path is None:
            skips["missing_image"] += 1
            print(f"skip (missing image): {xml_path.name}")
            continue

        try:
            with Image.open(image_path) as im:
                width, height = im.size
        except OSError as exc:
            skips["bad_image"] += 1
            print(f"skip (bad image): {image_path.name}: {exc}")
            continue

        if width <= 0 or height <= 0:
            skips["bad_size"] += 1
            continue

        lines = []
        for obj in root.findall("object"):
            name = (obj.findtext("name") or "").strip()
            if name not in CLASS_TO_ID:
                if name:
                    unknown_labels[name] += 1
                skips["unknown_class"] += 1
                continue
            if obj.findtext("difficult") == "1":
                skips["difficult"] += 1
                continue

            bnd = obj.find("bndbox")
            if bnd is None:
                skips["no_bndbox"] += 1
                continue

            xmin = float(bnd.findtext("xmin"))
            ymin = float(bnd.findtext("ymin"))
            xmax = float(bnd.findtext("xmax"))
            ymax = float(bnd.findtext("ymax"))

            # VOC -> YOLO normalized xywh (use real image size, not XML <size>)
            xc = ((xmin + xmax) / 2.0) / width
            yc = ((ymin + ymax) / 2.0) / height
            w = (xmax - xmin) / width
            h = (ymax - ymin) / height
            xc, yc, w, h = [max(0.0, min(1.0, v)) for v in (xc, yc, w, h)]
            if w <= 0 or h <= 0:
                skips["empty_box"] += 1
                continue

            lines.append(f"{CLASS_TO_ID[name]} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")

        if not lines:
            skips["no_kept_boxes"] += 1
            continue

        dest_img = out_images / image_path.name
        if not dest_img.exists():
            shutil.copy2(image_path, dest_img)

        (out_labels / f"{image_path.stem}.txt").write_text("\n".join(lines) + "\n")
        count += 1

    if skips:
        print(f"  skip summary: {dict(skips)}")
    if unknown_labels:
        print(f"  unknown class names: {dict(unknown_labels)}")
    return count


def write_dataset_yaml(dataset_root: Path) -> Path:
    yaml_path = dataset_root / "cop.yaml"
    names_block = "\n".join(f"  {i}: {name}" for i, name in enumerate(CLASSES))
    yaml_path.write_text(
        f"""# Auto-generated from Pascal VOC for RateMyCop detector training
path: {dataset_root.resolve()}
train: images/train
val: images/val

names:
{names_block}
"""
    )
    return yaml_path


def prepare_dataset(train_voc: Path, val_voc: Path, dataset_root: Path) -> Path:
    train_voc = train_voc.resolve()
    val_voc = val_voc.resolve()
    dataset_root = dataset_root.resolve()

    for path, label in ((train_voc, "train"), (val_voc, "val")):
        if path == dataset_root or dataset_root in path.parents:
            raise SystemExit(
                f"Refusing to wipe dataset-dir that overlaps {label} data:\n"
                f"  {label}={path}\n  dataset-dir={dataset_root}"
            )

    if dataset_root.exists():
        shutil.rmtree(dataset_root)

    n_train = convert_voc_split(
        train_voc,
        dataset_root / "images" / "train",
        dataset_root / "labels" / "train",
    )
    n_val = convert_voc_split(
        val_voc,
        dataset_root / "images" / "val",
        dataset_root / "labels" / "val",
    )
    print(f"Converted VOC -> YOLO: train={n_train}, val={n_val}")
    if n_train == 0:
        raise SystemExit(
            f"No training samples found in {train_voc}\n"
            "Expected a flat folder of images + matching *.xml Pascal VOC labels.\n"
            "Example: training/train/foo.jpg + training/train/foo.xml"
        )
    if n_val == 0:
        raise SystemExit(
            f"No validation samples found in {val_voc}\n"
            "Expected a flat folder of images + matching *.xml Pascal VOC labels."
        )
    return write_dataset_yaml(dataset_root)


def main() -> None:
    # Repo root = directory containing this script (supports running from anywhere)
    script_dir = Path(__file__).resolve().parent

    parser = argparse.ArgumentParser(description="Train cop detector (Model Maker replacement)")
    parser.add_argument("--train-dir", default="")
    parser.add_argument("--val-dir", default="")
    parser.add_argument("--dataset-dir", default="")
    parser.add_argument("--model", default="yolov8s.pt", help="Ultralytics checkpoint / model")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--imgsz", type=int, default=448, help="EfficientDet-Lite2 used 448")
    parser.add_argument("--tflite-name", default="cop-api.tflite")
    parser.add_argument("--device", default="")  # '' = auto
    args = parser.parse_args()

    train_dir = resolve_existing(
        Path(args.train_dir) if args.train_dir else Path("training/train"),
        script_dir / "training" / "train",
    )
    val_dir = resolve_existing(
        Path(args.val_dir) if args.val_dir else Path("training/validate"),
        script_dir / "training" / "validate",
    )
    dataset_dir = (
        Path(args.dataset_dir).resolve()
        if args.dataset_dir
        else resolve_existing(Path("training/yolo_dataset"), script_dir / "training" / "yolo_dataset")
        if (Path("training/yolo_dataset").exists() or (script_dir / "training" / "yolo_dataset").exists())
        else (Path("training/yolo_dataset") if Path("training").exists() else script_dir / "training" / "yolo_dataset")
    )
    # Prefer writing yolo_dataset next to the VOC folders we actually resolved
    if not args.dataset_dir:
        dataset_dir = train_dir.parent / "yolo_dataset"

    print(f"train-dir:    {train_dir}")
    print(f"val-dir:      {val_dir}")
    print(f"dataset-dir:  {dataset_dir}")

    data_yaml = prepare_dataset(train_dir, val_dir, dataset_dir)

    model = YOLO(args.model)
    train_kwargs = dict(
        data=str(data_yaml),
        epochs=args.epochs,
        batch=args.batch_size,
        imgsz=args.imgsz,
        project=str(script_dir / "runs" / "detect"),
        name="cop-api",
        exist_ok=True,
    )
    if args.device:
        train_kwargs["device"] = args.device

    model.train(**train_kwargs)

    best_pt = script_dir / "runs" / "detect" / "cop-api" / "weights" / "best.pt"
    if best_pt.exists():
        model = YOLO(str(best_pt))

    print("\n=== Model Maker equivalent: model.evaluate(val_data) ===")
    metrics = model.val(data=str(data_yaml), imgsz=args.imgsz, split="val")
    print(metrics)

    print("\n=== Export TFLite (model.export -> cop-api.tflite) ===")
    # int8 needs calibration images; pass the dataset yaml like Model Maker did
    export_path = model.export(
        format="litert",
        imgsz=args.imgsz,
        int8=True,
        data=str(data_yaml),
    ) 
    # int8 is depreciated use quantize instead
    export_path = Path(export_path)
    dest = Path(args.tflite_name)
    if not dest.is_absolute():
        dest = Path.cwd() / dest
    if export_path.resolve() != dest.resolve():
        shutil.copy2(export_path, dest)
    print(f"Wrote {dest.resolve()}")

    print("\n=== Evaluate TFLite (model.evaluate_tflite) ===")
    tflite_model = YOLO(str(dest))
    tflite_metrics = tflite_model.val(data=str(data_yaml), imgsz=args.imgsz, split="val")
    print(tflite_metrics)


if __name__ == "__main__":
    main()
