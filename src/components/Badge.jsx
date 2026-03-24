import { C } from "../theme";

export default function Badge({ children, color = "gray" }) {
  const p = {
    gray:  [C.bgPage,  C.textMid,  C.border],
    green: [C.okBg,    C.okText,   C.okBorder],
    amber: [C.warnBg,  C.warnText, C.warnBorder],
    red:   [C.errBg,   C.errText,  C.errBorder],
    blue:  [C.blueBg,  C.blue,     C.blueBorder],
  };
  const [bg, fg, bd] = p[color] || p.gray;
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: bg, color: fg, border: `1px solid ${bd}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
