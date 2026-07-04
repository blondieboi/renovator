import { Circle, Ellipse, Line, Rect, Text } from "react-konva";
import type { Fixture } from "../types";
import { fixtureLabels } from "../utils";

function PlanFixtureGlyph({ fixture, selected }: { fixture: Fixture; selected: boolean }) {
  const { width, height } = fixture;
  const stroke = selected ? "#242a27" : "#66756d";
  const strokeWidth = selected ? 2.5 : 1.5;
  const fill = "#fffdf7";
  const accent = "#d6e4dd";
  const detail = "#4c5c54";
  const labelY = Math.max(4, height - 14);

  const label = (
    <Text
      x={4}
      y={labelY}
      width={Math.max(0, width - 8)}
      text={fixtureLabels[fixture.kind]}
      fontSize={9}
      fontStyle="bold"
      align="center"
      fill="#303732"
      listening={false}
    />
  );

  let glyph: JSX.Element;
  switch (fixture.kind) {
    case "counter":
      glyph = (
        <>
          <Line points={[12, height * 0.5, width - 12, height * 0.5]} stroke={detail} strokeWidth={1.2} listening={false} />
          {[0.33, 0.66].map((ratio) => (
            <Line
              key={ratio}
              points={[width * ratio, 9, width * ratio, height - 9]}
              stroke={detail}
              strokeWidth={1}
              listening={false}
            />
          ))}
          <Ellipse
            x={width * 0.83}
            y={height * 0.5}
            radiusX={Math.max(8, width * 0.08)}
            radiusY={Math.max(6, height * 0.2)}
            fill={accent}
            stroke={detail}
            strokeWidth={1}
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
            height={height * 0.54}
            cornerRadius={10}
            fill={accent}
            stroke={detail}
            strokeWidth={1.2}
            listening={false}
          />
          <Ellipse
            x={width * 0.5}
            y={height * 0.43}
            radiusX={width * 0.21}
            radiusY={height * 0.17}
            fill={fill}
            stroke={detail}
            strokeWidth={1}
            listening={false}
          />
          <Line
            points={[width * 0.5, height * 0.2, width * 0.5, height * 0.3, width * 0.58, height * 0.3]}
            stroke={detail}
            strokeWidth={1.4}
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
            x={width * 0.2}
            y={height * 0.1}
            width={width * 0.6}
            height={height * 0.2}
            cornerRadius={4}
            fill={accent}
            stroke={detail}
            strokeWidth={1.2}
            listening={false}
          />
          <Line points={[width * 0.5, height * 0.3, width * 0.5, height * 0.38]} stroke={detail} strokeWidth={1} listening={false} />
          <Ellipse
            x={width * 0.5}
            y={height * 0.53}
            radiusX={width * 0.28}
            radiusY={height * 0.2}
            fill={accent}
            stroke={detail}
            strokeWidth={1.3}
            listening={false}
          />
          <Ellipse
            x={width * 0.5}
            y={height * 0.53}
            radiusX={width * 0.13}
            radiusY={height * 0.09}
            fill={fill}
            stroke={detail}
            strokeWidth={0.9}
            listening={false}
          />
        </>
      );
      break;
    case "shower":
      glyph = (
        <>
          <Line points={[10, height - 10, width - 10, 10]} stroke={detail} strokeWidth={1.2} listening={false} />
          <Circle x={width * 0.72} y={height * 0.72} radius={4} fill={detail} listening={false} />
          <Line
            points={[width * 0.22, height * 0.2, width * 0.34, height * 0.2, width * 0.34, height * 0.32]}
            stroke={detail}
            strokeWidth={1.3}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
          <Circle x={width * 0.37} y={height * 0.35} radius={4} fill={accent} stroke={detail} strokeWidth={1} listening={false} />
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
            height={height * 0.44}
            cornerRadius={16}
            fill={accent}
            stroke={detail}
            strokeWidth={1.3}
            listening={false}
          />
          <Ellipse
            x={width * 0.5}
            y={height * 0.42}
            radiusX={width * 0.32}
            radiusY={height * 0.14}
            fill={fill}
            stroke={detail}
            strokeWidth={0.9}
            listening={false}
          />
          <Circle x={width * 0.18} y={height * 0.25} radius={3} fill={detail} listening={false} />
          <Circle x={width * 0.24} y={height * 0.25} radius={3} fill={detail} listening={false} />
        </>
      );
      break;
    case "stairs":
      glyph = (
        <>
          {[1, 2, 3, 4, 5, 6].map((step) => {
            const y = (height * step) / 7;
            return <Line key={step} points={[12, y, width - 12, y]} stroke={detail} strokeWidth={1.2} listening={false} />;
          })}
          <Line points={[width * 0.24, height - 16, width * 0.76, 16]} stroke={detail} strokeWidth={1.4} listening={false} />
        </>
      );
      break;
    case "closet":
      glyph = (
        <>
          <Rect
            x={width * 0.1}
            y={height * 0.18}
            width={width * 0.8}
            height={height * 0.5}
            fill={accent}
            stroke={detail}
            strokeWidth={1.2}
            listening={false}
          />
          <Line points={[width * 0.5, height * 0.18, width * 0.5, height * 0.68]} stroke={detail} strokeWidth={1} listening={false} />
          <Circle x={width * 0.45} y={height * 0.43} radius={2.5} fill={detail} listening={false} />
          <Circle x={width * 0.55} y={height * 0.43} radius={2.5} fill={detail} listening={false} />
        </>
      );
      break;
    case "sofa":
      glyph = (
        <>
          <Rect
            x={width * 0.12}
            y={height * 0.2}
            width={width * 0.76}
            height={height * 0.24}
            cornerRadius={8}
            fill={accent}
            stroke={detail}
            strokeWidth={1.2}
            listening={false}
          />
          <Rect
            x={width * 0.08}
            y={height * 0.4}
            width={width * 0.84}
            height={height * 0.24}
            cornerRadius={8}
            fill={accent}
            stroke={detail}
            strokeWidth={1.2}
            listening={false}
          />
          <Line points={[width * 0.5, height * 0.41, width * 0.5, height * 0.63]} stroke={detail} strokeWidth={1} listening={false} />
          <Rect x={width * 0.04} y={height * 0.36} width={width * 0.1} height={height * 0.3} cornerRadius={4} fill={detail} listening={false} />
          <Rect x={width * 0.86} y={height * 0.36} width={width * 0.1} height={height * 0.3} cornerRadius={4} fill={detail} listening={false} />
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
            cornerRadius={6}
            fill={accent}
            stroke={detail}
            strokeWidth={1.3}
            listening={false}
          />
          <Rect
            x={width * 0.2}
            y={height * 0.18}
            width={width * 0.6}
            height={height * 0.18}
            cornerRadius={5}
            fill={fill}
            stroke={detail}
            strokeWidth={1}
            listening={false}
          />
          <Line points={[width * 0.12, height * 0.43, width * 0.88, height * 0.43]} stroke={detail} strokeWidth={1} listening={false} />
          <Line points={[width * 0.5, height * 0.43, width * 0.5, height * 0.84]} stroke={detail} strokeWidth={0.9} listening={false} />
        </>
      );
      break;
    case "table":
      glyph = (
        <>
          <Rect x={width * 0.38} y={height * 0.04} width={width * 0.24} height={height * 0.12} cornerRadius={3} fill={accent} stroke={detail} strokeWidth={1} listening={false} />
          <Rect x={width * 0.38} y={height * 0.84} width={width * 0.24} height={height * 0.12} cornerRadius={3} fill={accent} stroke={detail} strokeWidth={1} listening={false} />
          <Rect x={width * 0.04} y={height * 0.38} width={width * 0.12} height={height * 0.24} cornerRadius={3} fill={accent} stroke={detail} strokeWidth={1} listening={false} />
          <Rect x={width * 0.84} y={height * 0.38} width={width * 0.12} height={height * 0.24} cornerRadius={3} fill={accent} stroke={detail} strokeWidth={1} listening={false} />
          <Ellipse
            x={width * 0.5}
            y={height * 0.5}
            radiusX={width * 0.3}
            radiusY={height * 0.24}
            fill={fill}
            stroke={detail}
            strokeWidth={1.3}
            listening={false}
          />
        </>
      );
      break;
  }

  return (
    <>
      <Rect
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={fixture.kind === "sink" || fixture.kind === "toilet" || fixture.kind === "table" ? 14 : 5}
      />
      {glyph}
      {label}
    </>
  );
}

export default PlanFixtureGlyph;
