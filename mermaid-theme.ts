/**
 * Mermaid palettes, derived from the rpp.gmbh brand tokens.
 *
 * Kept as two separate sets because `themeConfig.mermaid.options` applies one
 * object to both color modes, which is why diagrams were previously drawn with
 * navy #0D304F edges on the near-black dark ground — effectively invisible.
 * src/theme/Mermaid/index.tsx picks between these per mode.
 *
 * Brand reference:
 *   universum #0d304f · zuendung #e8736d · rakete #efefef
 *   hue (teal) #77c6c0 · platform #b5c2d3
 *   dark ground #030712 · text ramp #eaf1fb / #9fb0cc / #7d8fb5
 *
 * The variable groups below map to the diagram types actually used in these
 * docs: flowchart (+ subgraph), block-beta, sequenceDiagram and mindmap.
 */

const fontFamily = '"Open Sans", "Helvetica Neue", Arial, sans-serif';

export const mermaidLight = {
  darkMode: false,
  background: '#ffffff',
  fontFamily,
  fontSize: '15px',

  // generic palette
  primaryColor: '#eaf2f2',
  primaryTextColor: '#0d304f',
  primaryBorderColor: '#2a6e68',
  secondaryColor: '#eef1f6',
  secondaryTextColor: '#0d304f',
  secondaryBorderColor: '#b5c2d3',
  tertiaryColor: '#fdf1f0',
  tertiaryTextColor: '#0d304f',
  tertiaryBorderColor: '#e8736d',
  lineColor: '#4f637d',
  textColor: '#0d304f',
  titleColor: '#0d304f',

  // flowchart + block-beta nodes
  mainBkg: '#eaf2f2',
  nodeBorder: '#2a6e68',
  nodeTextColor: '#0d304f',
  clusterBkg: '#f7f9fb',
  clusterBorder: '#b5c2d3',
  edgeLabelBackground: '#ffffff',

  // sequenceDiagram
  actorBkg: '#eaf2f2',
  actorBorder: '#2a6e68',
  actorTextColor: '#0d304f',
  actorLineColor: '#b5c2d3',
  signalColor: '#0d304f',
  signalTextColor: '#0d304f',
  labelBoxBkgColor: '#eaf2f2',
  labelBoxBorderColor: '#2a6e68',
  labelTextColor: '#0d304f',
  loopTextColor: '#0d304f',
  noteBkgColor: '#fdf1f0',
  noteBorderColor: '#e8736d',
  noteTextColor: '#0d304f',
  activationBkgColor: '#eaf2f2',
  activationBorderColor: '#2a6e68',
  sequenceNumberColor: '#ffffff',

  // mindmap — all 12 section scales must be set. The overview mindmap uses
  // section-(-1) through section-10; anything left undefined falls back to
  // mermaid's default #efefef, which is how most of its nodes were previously
  // drawn off-brand. Every label below clears 4.5:1 against its own fill.
  cScale0: '#2a6e68',
  cScale1: '#bb3a33',
  cScale2: '#4f637d',
  cScale3: '#0d304f',
  cScale4: '#2f7069',
  cScale5: '#d4544d',
  cScale6: '#5c8f88',
  cScale7: '#596a80',
  cScale8: '#1f524e',
  cScale9: '#a8322d',
  cScale10: '#77a09a',
  cScale11: '#2c4763',
  cScaleLabel0: '#eaf1fb',
  cScaleLabel1: '#eaf1fb',
  cScaleLabel2: '#eaf1fb',
  cScaleLabel3: '#eaf1fb',
  cScaleLabel4: '#eaf1fb',
  cScaleLabel5: '#030712',
  cScaleLabel6: '#030712',
  cScaleLabel7: '#eaf1fb',
  cScaleLabel8: '#eaf1fb',
  cScaleLabel9: '#eaf1fb',
  cScaleLabel10: '#030712',
  cScaleLabel11: '#eaf1fb',
};

export const mermaidDark = {
  // Tells mermaid to lighten derived shades rather than darken them.
  darkMode: true,
  background: '#030712',
  fontFamily,
  fontSize: '15px',

  // generic palette — fills are the brand hues at ~20% over the dark ground,
  // so they read as tinted panels rather than blocks of saturated color.
  primaryColor: '#1b2d35',
  primaryTextColor: '#eaf1fb',
  primaryBorderColor: '#77c6c0',
  secondaryColor: '#272c39',
  secondaryTextColor: '#eaf1fb',
  secondaryBorderColor: '#9fb0cc',
  tertiaryColor: '#311d24',
  tertiaryTextColor: '#eaf1fb',
  tertiaryBorderColor: '#e8736d',
  lineColor: '#7d8fb5',
  textColor: '#eaf1fb',
  titleColor: '#eaf1fb',

  // flowchart + block-beta nodes
  mainBkg: '#1b2d35',
  nodeBorder: '#77c6c0',
  nodeTextColor: '#eaf1fb',
  clusterBkg: '#070d1a',
  clusterBorder: '#1c222f',
  edgeLabelBackground: '#060b19',

  // sequenceDiagram
  actorBkg: '#1b2d35',
  actorBorder: '#77c6c0',
  actorTextColor: '#eaf1fb',
  actorLineColor: '#3d4a61',
  signalColor: '#9fb0cc',
  signalTextColor: '#eaf1fb',
  labelBoxBkgColor: '#1b2d35',
  labelBoxBorderColor: '#77c6c0',
  labelTextColor: '#eaf1fb',
  loopTextColor: '#eaf1fb',
  noteBkgColor: '#311d24',
  noteBorderColor: '#e8736d',
  noteTextColor: '#eaf1fb',
  activationBkgColor: '#1b2d35',
  activationBorderColor: '#77c6c0',
  sequenceNumberColor: '#030712',

  // mindmap — saturated brand hues with dark labels. All 12 scales are set:
  // the overview mindmap uses section-(-1) through section-10, and any scale
  // left undefined falls back to mermaid's default #efefef. Every label below
  // clears 4.5:1 against its own fill.
  cScale0: '#77c6c0',
  cScale1: '#e8736d',
  cScale2: '#b5c2d3',
  cScale3: '#9fb0cc',
  cScale4: '#5dada7',
  cScale5: '#ef9d99',
  cScale6: '#8dcfca',
  cScale7: '#7d8fb5',
  cScale8: '#429c95',
  cScale9: '#c4726d',
  cScale10: '#99d4cf',
  cScale11: '#7688b0',
  cScaleLabel0: '#030712',
  cScaleLabel1: '#030712',
  cScaleLabel2: '#030712',
  cScaleLabel3: '#030712',
  cScaleLabel4: '#030712',
  cScaleLabel5: '#030712',
  cScaleLabel6: '#030712',
  cScaleLabel7: '#030712',
  cScaleLabel8: '#030712',
  cScaleLabel9: '#030712',
  cScaleLabel10: '#030712',
  cScaleLabel11: '#030712',
};
