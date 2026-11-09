/* Praise Kier */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CellRef, FloorCursor } from "../lib/types";
import { clampCell, type TileStore } from "../lib/grid";

const CELL_SIZE = 24;
const OVERSCAN = 2;
const MAX_CELLS = 2500;

interface ClaimInfo {
  userId: number;
  displayName: string;
}

interface VirtualGridProps {
  store: TileStore;
  rows: number;
  cols: number;
  threshold: number;
  selected: Set<string>;
  claims: Map<string, ClaimInfo>;
  cursors: FloorCursor[];
  focus: CellRef;
  initialCell: CellRef;
  onFocusChange: (cell: CellRef) => void;
  onSelect: (cell: CellRef) => void;
  onDragStart?: (cell: CellRef, event: React.PointerEvent<HTMLDivElement>) => void;
  onPositionChange?: (cell: CellRef) => void;
}

function cellKey(r: number, c: number): string {
  return `${r}:${c}`;
}

function binClass(bin: string): string {
  switch (bin) {
    case "W":
      return "text-lumon-mint";
    case "F":
      return "text-lumon-amber";
    case "D":
      return "text-lumon-danger";
    case "M":
      return "text-fuchsia-300";
    default:
      return "";
  }
}

export function VirtualGrid({
  store,
  rows,
  cols,
  threshold,
  selected,
  claims,
  cursors,
  focus,
  initialCell,
  onFocusChange,
  onSelect,
  onDragStart,
  onPositionChange,
}: VirtualGridProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [, setVersion] = useState(0);
  const lastPosition = useRef(0);
  const initialised = useRef(false);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => setVersion((value) => value + 1));
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scrollToCell = (cell: CellRef, behavior: ScrollBehavior = "auto"): void => {
    const element = viewportRef.current;
    if (!element) return;
    const x = cell.c * CELL_SIZE;
    const y = cell.r * CELL_SIZE;
    const margin = CELL_SIZE * 2;
    let nextLeft = element.scrollLeft;
    let nextTop = element.scrollTop;
    if (x < element.scrollLeft + margin) nextLeft = Math.max(0, x - margin);
    else if (x + CELL_SIZE > element.scrollLeft + element.clientWidth - margin)
      nextLeft = x + CELL_SIZE - element.clientWidth + margin;
    if (y < element.scrollTop + margin) nextTop = Math.max(0, y - margin);
    else if (y + CELL_SIZE > element.scrollTop + element.clientHeight - margin)
      nextTop = y + CELL_SIZE - element.clientHeight + margin;
    if (nextLeft !== element.scrollLeft || nextTop !== element.scrollTop) {
      element.scrollTo({ left: nextLeft, top: nextTop, behavior });
    }
  };

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    scrollToCell(initialCell);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCell.r, initialCell.c]);

  const range = useMemo(() => {
    let startRow = Math.max(0, Math.floor(scroll.top / CELL_SIZE) - OVERSCAN);
    let endRow = Math.min(rows - 1, Math.ceil((scroll.top + size.height) / CELL_SIZE) + OVERSCAN);
    let startCol = Math.max(0, Math.floor(scroll.left / CELL_SIZE) - OVERSCAN);
    let endCol = Math.min(cols - 1, Math.ceil((scroll.left + size.width) / CELL_SIZE) + OVERSCAN);

    while ((endRow - startRow + 1) * (endCol - startCol + 1) > MAX_CELLS) {
      if (endRow - startRow >= endCol - startCol) endRow -= 1;
      else endCol -= 1;
    }

    if (focus.r < startRow) {
      const span = endRow - startRow;
      startRow = Math.min(focus.r, Math.max(0, rows - 1 - span));
      endRow = Math.min(rows - 1, startRow + span);
    } else if (focus.r > endRow) {
      const span = endRow - startRow;
      startRow = Math.min(Math.max(0, focus.r - span), Math.max(0, rows - 1 - span));
      endRow = Math.min(rows - 1, startRow + span);
    }
    if (focus.c < startCol) {
      const span = endCol - startCol;
      startCol = Math.min(focus.c, Math.max(0, cols - 1 - span));
      endCol = Math.min(cols - 1, startCol + span);
    } else if (focus.c > endCol) {
      const span = endCol - startCol;
      startCol = Math.min(Math.max(0, focus.c - span), Math.max(0, cols - 1 - span));
      endCol = Math.min(cols - 1, startCol + span);
    }

    return { startRow, endRow, startCol, endCol };
  }, [scroll.top, scroll.left, size.height, size.width, rows, cols, focus.r, focus.c]);

  useEffect(() => {
    scrollToCell(focus);
  }, [focus.r, focus.c]);

  useEffect(() => {
    const keys = store.visibleTileKeys(range.startRow, range.endRow, range.startCol, range.endCol);
    store.setWanted(keys);
    for (const key of keys) {
      const [row, col] = key.split(":");
      if (row !== undefined && col !== undefined) void store.load(Number(row), Number(col));
    }
  }, [store, range.startRow, range.endRow, range.startCol, range.endCol]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastPosition.current < 250) return;
    lastPosition.current = now;
    const centerRow = Math.floor((scroll.top + size.height / 2) / CELL_SIZE);
    const centerCol = Math.floor((scroll.left + size.width / 2) / CELL_SIZE);
    onPositionChange?.(clampCell(centerRow, centerCol, rows, cols));
  }, [scroll.top, scroll.left, size.height, size.width, rows, cols, onPositionChange]);

  const onScroll = (event: React.UIEvent<HTMLDivElement>): void => {
    const target = event.currentTarget;
    setScroll({ top: target.scrollTop, left: target.scrollLeft });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const pageRows = Math.max(1, Math.floor(size.height / CELL_SIZE) - 2);
    let next: CellRef | null = null;
    switch (event.key) {
      case "ArrowUp":
        next = { r: focus.r - 1, c: focus.c };
        break;
      case "ArrowDown":
        next = { r: focus.r + 1, c: focus.c };
        break;
      case "ArrowLeft":
        next = { r: focus.r, c: focus.c - 1 };
        break;
      case "ArrowRight":
        next = { r: focus.r, c: focus.c + 1 };
        break;
      case "PageUp":
        next = { r: focus.r - pageRows, c: focus.c };
        break;
      case "PageDown":
        next = { r: focus.r + pageRows, c: focus.c };
        break;
      case "Home":
        next = { r: focus.r, c: 0 };
        break;
      case "End":
        next = { r: focus.r, c: cols - 1 };
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect(focus);
        return;
      default:
        return;
    }
    event.preventDefault();
    const clamped = clampCell(next.r, next.c, rows, cols);
    onFocusChange(clamped);
    scrollToCell(clamped);
  };

  const cells: JSX.Element[] = [];
  for (let r = range.startRow; r <= range.endRow; r += 1) {
    for (let c = range.startCol; c <= range.endCol; c += 1) {
      const key = cellKey(r, c);
      const cell = store.getCell(r, c);
      const isFocus = focus.r === r && focus.c === c;
      const isSelected = selected.has(key);
      const claim = claims.get(key);
      const scary = cell ? cell.tremor >= threshold : false;
      const bin = cell?.bin ?? ".";
      const reducedDuration = cell ? Math.max(120, 620 - cell.tremor * 4) : 300;

      cells.push(
        <div
          key={key}
          id={`cell-${r}-${c}`}
          role="gridcell"
          aria-rowindex={r + 1}
          aria-colindex={c + 1}
          aria-selected={isSelected}
          aria-label={`Fila ${r + 1}, columna ${c + 1}${cell ? `, dígito ${cell.digit}, temblor ${cell.tremor}` : ", sin cargar"}`}
          tabIndex={-1}
          onClick={() => {
            onFocusChange({ r, c });
            onSelect({ r, c });
          }}
          onDoubleClick={() => onSelect({ r, c })}
          onPointerDown={(event) => {
            if (isSelected && onDragStart) onDragStart({ r, c }, event);
          }}
          className={[
            "absolute flex select-none items-center justify-center border border-lumon-line/30 font-mono text-[11px]",
            cell ? (scary ? "bg-lumon-mint/10 text-lumon-mint" : "text-lumon-mint/35") : "bg-lumon-panel/30 text-transparent",
            scary ? "motion-safe:animate-tremor" : "",
            binClass(bin),
            isSelected ? "z-10 ring-2 ring-inset ring-lumon-amber" : "",
            claim && !isSelected ? "ring-1 ring-inset ring-lumon-danger/80" : "",
            isFocus ? "outline outline-2 -outline-offset-2 outline-white" : "",
          ].join(" ")}
          style={{
            left: c * CELL_SIZE,
            top: r * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
            animationDuration: scary ? `${reducedDuration}ms` : undefined,
            cursor: isSelected && onDragStart ? "grab" : "pointer",
          }}
        >
          {cell ? (scary ? cell.digit : cell.digit) : ""}
          {claim ? (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-lumon-danger" aria-hidden="true" />
          ) : null}
        </div>,
      );
    }
  }

  const visibleCursors = cursors.filter(
    (cursor) =>
      cursor.r >= range.startRow && cursor.r <= range.endRow && cursor.c >= range.startCol && cursor.c <= range.endCol,
  );

  return (
    <div
      ref={viewportRef}
      role="grid"
      aria-rowcount={rows}
      aria-colcount={cols}
      aria-label="Grilla de macrodata"
      aria-activedescendant={`cell-${focus.r}-${focus.c}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
      className="relative max-h-[70vh] overflow-auto rounded border border-lumon-line bg-lumon-ink outline-none focus-visible:ring-1 focus-visible:ring-lumon-mint"
    >
      <div style={{ width: cols * CELL_SIZE, height: rows * CELL_SIZE, position: "relative" }}>
        {cells}
        {visibleCursors.map((cursor) => (
          <div
            key={`cursor-${cursor.userId}`}
            className="pointer-events-none absolute z-20 rounded border border-lumon-amber/80 bg-lumon-amber/20 px-1 text-[9px] text-lumon-amber"
            style={{ left: cursor.c * CELL_SIZE, top: cursor.r * CELL_SIZE }}
            aria-hidden="true"
          >
            {cursor.displayName?.slice(0, 8) ?? `U${cursor.userId}`}
          </div>
        ))}
      </div>
    </div>
  );
}
