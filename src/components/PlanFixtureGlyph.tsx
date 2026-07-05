import { Circle, Ellipse, Line, Rect } from "react-konva";
import type { Fixture, FixtureKind } from "../types";

type FixturePalette = {
  footprint: string;
  ink: string;
  selected: string;
};

const fixturePalettes: Record<FixtureKind, FixturePalette> = {
  counter: {
    footprint: "rgba(247, 246, 239, 0.82)",
    ink: "#5b635b",
    selected: "#315f58",
  },
  sink: {
    footprint: "rgba(242, 248, 245, 0.82)",
    ink: "#52675f",
    selected: "#315f58",
  },
  toilet: {
    footprint: "rgba(242, 248, 245, 0.82)",
    ink: "#52675f",
    selected: "#315f58",
  },
  shower: {
    footprint: "rgba(242, 248, 245, 0.82)",
    ink: "#52675f",
    selected: "#315f58",
  },
  tub: {
    footprint: "rgba(242, 248, 245, 0.82)",
    ink: "#52675f",
    selected: "#315f58",
  },
  stairs: {
    footprint: "rgba(244, 247, 241, 0.8)",
    ink: "#5d6554",
    selected: "#315f58",
  },
  closet: {
    footprint: "rgba(247, 246, 239, 0.82)",
    ink: "#5b635b",
    selected: "#315f58",
  },
  sofa: {
    footprint: "rgba(246, 244, 238, 0.82)",
    ink: "#526159",
    selected: "#315f58",
  },
  bed: {
    footprint: "rgba(246, 244, 238, 0.82)",
    ink: "#526159",
    selected: "#315f58",
  },
  table: {
    footprint: "rgba(247, 246, 239, 0.82)",
    ink: "#5b635b",
    selected: "#315f58",
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function PlanFixtureGlyph({ fixture, selected }: { fixture: Fixture; selected: boolean }) {
  const { width, height } = fixture;
  const palette = fixturePalettes[fixture.kind];
  const pad = clamp(Math.min(width, height) * 0.1, 5, 10);
  const cornerRadius = clamp(Math.min(width, height) * 0.08, 3, 8);
  const detailStroke = clamp(Math.min(width, height) / 58, 0.75, 1.2);

  const selectionHandleSize = clamp(Math.min(width, height) * 0.18, 7, 15);
  const selection = selected ? (
    <>
      <Rect
        x={-2}
        y={-2}
        width={width + 4}
        height={height + 4}
        stroke={palette.selected}
        strokeWidth={1.5}
        cornerRadius={cornerRadius + 2}
        dash={[5, 4]}
        listening={false}
      />
      {[
        [1, 1, 1, selectionHandleSize, selectionHandleSize, 1],
        [width - 1, 1, width - selectionHandleSize, 1, width - 1, selectionHandleSize],
        [1, height - 1, selectionHandleSize, height - 1, 1, height - selectionHandleSize],
        [
          width - 1,
          height - 1,
          width - 1,
          height - selectionHandleSize,
          width - selectionHandleSize,
          height - 1,
        ],
      ].map((points, index) => (
        <Line
          key={index}
          points={points}
          stroke={palette.selected}
          strokeWidth={2}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      ))}
    </>
  ) : null;

  let glyph: JSX.Element;
  switch (fixture.kind) {
    case "counter":
      glyph = (
        <>
          <Rect
            x={pad}
            y={height * 0.24}
            width={Math.max(0, width - pad * 2)}
            height={height * 0.36}
            cornerRadius={2}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          {[0.33, 0.66].map((ratio) => (
            <Line
              key={ratio}
              points={[width * ratio, height * 0.27, width * ratio, height * 0.57]}
              stroke={palette.ink}
              strokeWidth={0.7}
              opacity={0.48}
              listening={false}
            />
          ))}
          <Rect
            x={width * 0.74}
            y={height * 0.32}
            width={Math.max(8, width * 0.14)}
            height={Math.max(6, height * 0.14)}
            cornerRadius={3}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={0.85}
            listening={false}
          />
          <Line
            points={[pad, height * 0.68, width - pad, height * 0.68]}
            stroke={palette.ink}
            strokeWidth={0.7}
            opacity={0.35}
            listening={false}
          />
        </>
      );
      break;
    case "sink":
      glyph = (
        <>
          <Rect
            x={width * 0.18}
            y={height * 0.16}
            width={width * 0.64}
            height={height * 0.52}
            cornerRadius={cornerRadius}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Ellipse
            x={width * 0.5}
            y={height * 0.42}
            radiusX={width * 0.22}
            radiusY={height * 0.15}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={0.9}
            listening={false}
          />
          <Circle x={width * 0.5} y={height * 0.42} radius={1.8} fill={palette.ink} opacity={0.58} listening={false} />
          <Line
            points={[width * 0.5, height * 0.2, width * 0.5, height * 0.3, width * 0.6, height * 0.3]}
            stroke={palette.ink}
            strokeWidth={1}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        </>
      );
      break;
    case "toilet":
      glyph = (
        <>
          <Rect
            x={width * 0.22}
            y={height * 0.12}
            width={width * 0.56}
            height={height * 0.18}
            cornerRadius={3}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Ellipse
            x={width * 0.5}
            y={height * 0.53}
            radiusX={width * 0.29}
            radiusY={height * 0.21}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Ellipse
            x={width * 0.5}
            y={height * 0.53}
            radiusX={width * 0.15}
            radiusY={height * 0.1}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={0.75}
            listening={false}
          />
          <Line points={[width * 0.5, height * 0.3, width * 0.5, height * 0.36]} stroke={palette.ink} strokeWidth={0.75} opacity={0.6} listening={false} />
        </>
      );
      break;
    case "shower":
      glyph = (
        <>
          <Line
            points={[pad, height - pad, width - pad, pad]}
            stroke={palette.ink}
            strokeWidth={detailStroke}
            opacity={0.68}
            listening={false}
          />
          <Line
            points={[pad + 2, pad + 2, width - pad - 2, pad + 2, width - pad - 2, height - pad - 2]}
            stroke={palette.ink}
            strokeWidth={0.7}
            opacity={0.38}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
          <Line
            points={[width * 0.25, height * 0.23, width * 0.37, height * 0.23, width * 0.37, height * 0.35]}
            stroke={palette.ink}
            strokeWidth={0.95}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
          <Circle x={width * 0.4} y={height * 0.38} radius={3} fill="transparent" stroke={palette.ink} strokeWidth={0.8} listening={false} />
          <Circle x={width * 0.72} y={height * 0.72} radius={2.4} fill={palette.ink} opacity={0.55} listening={false} />
        </>
      );
      break;
    case "tub":
      glyph = (
        <>
          <Rect
            x={width * 0.08}
            y={height * 0.2}
            width={width * 0.84}
            height={height * 0.45}
            cornerRadius={cornerRadius + 4}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Ellipse
            x={width * 0.51}
            y={height * 0.43}
            radiusX={width * 0.32}
            radiusY={height * 0.14}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={0.75}
            listening={false}
          />
          <Line
            points={[width * 0.18, height * 0.24, width * 0.27, height * 0.24]}
            stroke={palette.ink}
            strokeWidth={1.2}
            lineCap="round"
            listening={false}
          />
        </>
      );
      break;
    case "stairs":
      glyph = (
        <>
          {Array.from({ length: 7 }, (_, index) => {
            const y = pad + ((height - pad * 2) * index) / 6;
            return (
              <Line
                key={index}
                points={[pad, y, width - pad, y]}
                stroke={palette.ink}
                strokeWidth={detailStroke}
                opacity={0.6}
                listening={false}
              />
            );
          })}
          <Line
            points={[width * 0.26, height - pad, width * 0.74, pad]}
            stroke={palette.ink}
            strokeWidth={1.4}
            lineCap="round"
            listening={false}
          />
          <Line
            points={[width * 0.67, pad + 4, width * 0.74, pad, width * 0.74, pad + 8]}
            stroke={palette.ink}
            strokeWidth={1.3}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        </>
      );
      break;
    case "closet":
      glyph = (
        <>
          <Rect
            x={pad}
            y={height * 0.18}
            width={Math.max(0, width - pad * 2)}
            height={height * 0.48}
            cornerRadius={2}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Line points={[width * 0.5, height * 0.18, width * 0.5, height * 0.66]} stroke={palette.ink} strokeWidth={0.85} listening={false} />
          <Line
            points={[pad + 4, height * 0.3, width * 0.5 - 3, height * 0.5, pad + 4, height * 0.66]}
            stroke={palette.ink}
            strokeWidth={0.85}
            opacity={0.62}
            listening={false}
          />
          <Line
            points={[width - pad - 4, height * 0.3, width * 0.5 + 3, height * 0.5, width - pad - 4, height * 0.66]}
            stroke={palette.ink}
            strokeWidth={0.85}
            opacity={0.62}
            listening={false}
          />
        </>
      );
      break;
    case "sofa":
      glyph = (
        <>
          <Rect
            x={width * 0.13}
            y={height * 0.23}
            width={width * 0.74}
            height={height * 0.18}
            cornerRadius={3}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Rect
            x={width * 0.11}
            y={height * 0.4}
            width={width * 0.78}
            height={height * 0.19}
            cornerRadius={3}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Line
            points={[width * 0.33, height * 0.41, width * 0.33, height * 0.58, width * 0.67, height * 0.58, width * 0.67, height * 0.41]}
            stroke={palette.ink}
            strokeWidth={0.7}
            opacity={0.42}
            listening={false}
          />
          <Line
            points={[width * 0.08, height * 0.34, width * 0.08, height * 0.63, width * 0.16, height * 0.63]}
            stroke={palette.ink}
            strokeWidth={detailStroke}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
          <Line
            points={[width * 0.92, height * 0.34, width * 0.92, height * 0.63, width * 0.84, height * 0.63]}
            stroke={palette.ink}
            strokeWidth={detailStroke}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        </>
      );
      break;
    case "bed":
      glyph = (
        <>
          <Rect
            x={width * 0.12}
            y={height * 0.12}
            width={width * 0.76}
            height={height * 0.72}
            cornerRadius={3}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          <Rect
            x={width * 0.2}
            y={height * 0.18}
            width={width * 0.26}
            height={height * 0.16}
            cornerRadius={2}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={0.75}
            listening={false}
          />
          <Rect
            x={width * 0.54}
            y={height * 0.18}
            width={width * 0.26}
            height={height * 0.16}
            cornerRadius={2}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={0.75}
            listening={false}
          />
          <Line points={[width * 0.12, height * 0.42, width * 0.88, height * 0.42]} stroke={palette.ink} strokeWidth={0.75} opacity={0.48} listening={false} />
          <Line points={[width * 0.5, height * 0.42, width * 0.5, height * 0.84]} stroke={palette.ink} strokeWidth={0.65} opacity={0.35} listening={false} />
        </>
      );
      break;
    case "table":
      glyph = (
        <>
          <Ellipse
            x={width * 0.5}
            y={height * 0.5}
            radiusX={width * 0.3}
            radiusY={height * 0.22}
            fill="transparent"
            stroke={palette.ink}
            strokeWidth={detailStroke}
            listening={false}
          />
          {[
            [width * 0.39, height * 0.1, width * 0.22, height * 0.06],
            [width * 0.39, height * 0.84, width * 0.22, height * 0.06],
            [width * 0.1, height * 0.39, width * 0.06, height * 0.22],
            [width * 0.84, height * 0.39, width * 0.06, height * 0.22],
          ].map(([x, y, itemWidth, itemHeight], index) => (
            <Rect
              key={index}
              x={x}
              y={y}
              width={itemWidth}
              height={itemHeight}
              cornerRadius={2}
              fill="transparent"
              stroke={palette.ink}
              strokeWidth={0.7}
              opacity={0.58}
              listening={false}
            />
          ))}
        </>
      );
      break;
  }

  return (
    <>
      <Rect
        width={width}
        height={height}
        fill={palette.footprint}
        stroke={selected ? palette.selected : palette.ink}
        strokeWidth={selected ? 1.6 : 1}
        cornerRadius={cornerRadius}
        opacity={selected ? 0.98 : 0.88}
      />
      {glyph}
      {selection}
    </>
  );
}

export default PlanFixtureGlyph;
