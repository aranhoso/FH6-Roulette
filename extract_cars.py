import argparse
import json
import re
from html.parser import HTMLParser
from pathlib import Path


def normalize_text(value):
    return re.sub(r"\s+", " ", value).strip()


def to_snake_case(value):
    value = value.replace("&", "and")
    value = re.sub(r"[^a-zA-Z0-9]+", "_", value)
    return value.strip("_").lower()


def split_list(value):
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_car_class(value):
    match = re.match(r"^(\d+)\s+(.+)$", value.strip())
    if not match:
        return None, value.strip() or None
    return int(match.group(1)), match.group(2)


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self._in_table = False
        self._current_table = []
        self._current_row = None
        self._current_cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._in_table = True
            self._current_table = []
        elif self._in_table and tag == "tr":
            self._current_row = []
        elif self._in_table and tag in {"th", "td"}:
            self._current_cell = []

    def handle_data(self, data):
        if self._current_cell is not None:
            self._current_cell.append(data)

    def handle_endtag(self, tag):
        if self._in_table and tag in {"th", "td"} and self._current_cell is not None:
            self._current_row.append(normalize_text("".join(self._current_cell)))
            self._current_cell = None
        elif self._in_table and tag == "tr" and self._current_row is not None:
            if any(cell for cell in self._current_row):
                self._current_table.append(self._current_row)
            self._current_row = None
        elif tag == "table" and self._in_table:
            self.tables.append(self._current_table)
            self._in_table = False


def extract_car_rows(html):
    parser = TableParser()
    parser.feed(html)

    for table in parser.tables:
        if not table:
            continue

        headers = table[0]
        if {"Make", "Car Name", "Car Class"}.issubset(set(headers)):
            keys = [to_snake_case(header) for header in headers]
            return [dict(zip(keys, row)) for row in table[1:] if len(row) == len(keys)]

    raise ValueError("No car table was found in the input file.")


def transform_car(row):
    performance_index, car_class = parse_car_class(row.get("car_class", ""))

    return {
        "make": row.get("make", ""),
        "car_name": row.get("car_name", ""),
        "car_type": row.get("car_type", ""),
        "performance_index": performance_index,
        "car_class": car_class,
        "country": row.get("country", ""),
        "collection": split_list(row.get("collection", "")),
    }


def main():
    arg_parser = argparse.ArgumentParser(
        description="Extract the Forza car table from cars.txt and save it as JSON."
    )
    arg_parser.add_argument("-i", "--input", default="cars.txt", help="Input HTML/text file.")
    arg_parser.add_argument("-o", "--output", default="cars.json", help="Output JSON file.")
    arg_parser.add_argument(
        "--raw",
        action="store_true",
        help="Keep the table columns exactly as text instead of normalizing fields.",
    )
    args = arg_parser.parse_args()

    html = Path(args.input).read_text(encoding="utf-8")
    rows = extract_car_rows(html)
    cars = rows if args.raw else [transform_car(row) for row in rows]

    Path(args.output).write_text(
        json.dumps(cars, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Extracted {len(cars)} cars to {args.output}")


if __name__ == "__main__":
    main()
