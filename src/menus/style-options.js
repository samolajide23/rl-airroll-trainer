const option = (name, description, light, bg, surface, ink, muted, accent, secondary, buttonInk, font, radius, edge) => ({
  name, description, light,
  tokens: { bg, surface, ink, muted, accent, secondary, 'button-ink': buttonInk, 'display-font': font, radius, edge,
    line: `color-mix(in srgb, ${ink}, transparent 80%)` },
});

export const styleOptions = [
  option('Circuit', 'Graphite, electric cyan and signal orange. Crisp technical edges; compact training cards.', false, '#121619', '#1e2529', '#f3f7f8', '#b0bec5', '#50d8ef', '#ffad66', '#101b20', "'Chakra Petch', sans-serif", '3px', '1px'),
  option('Rally', 'White, racing red and petrol teal. Bold sports typography; strong ticket-like borders.', true, '#f6f7f8', '#ffffff', '#20272b', '#53636b', '#bc2438', '#126f79', '#ffffff', "'Barlow Condensed', sans-serif", '2px', '2px'),
  option('Volt', 'Carbon, vibrant neon green and ice blue. Dense competition console; decisive active states.', false, '#181a18', '#252924', '#f5f7ee', '#b2bdad', '#39ff14', '#83cdec', '#182014', "'Barlow Condensed', sans-serif", '0px', '1px'),
  option('Glacier', 'Cool white, deep teal and coral. Open spacing; precise, quieter card surfaces.', true, '#eef5f5', '#ffffff', '#153b40', '#526e72', '#086c77', '#b73845', '#ffffff', "'Space Grotesk', sans-serif", '6px', '1px'),
  option('Afterhours', 'Near-black, warm gold and pool cyan. Spacious premium garage; thin illuminated edges.', false, '#181818', '#242424', '#f7f3e9', '#c0bbb0', '#edc36b', '#6ed5d1', '#201b12', "'Space Grotesk', sans-serif", '6px', '1px'),
  option('Gridline', 'Silver, cobalt and vermilion. Technical grid texture; squared engineering panels.', true, '#edf0f3', '#fafbfd', '#202b3a', '#536174', '#2454bd', '#bd3b23', '#ffffff', "'Chakra Petch', sans-serif", '0px', '1px'),
  option('Pitlane', 'Black, hot coral and off-white. Punchy condensed headings; offset collectible-card edges.', false, '#1b1819', '#292326', '#fcf3f4', '#c6afb7', '#ff899c', '#e9d880', '#2c1019', "'Barlow Condensed', sans-serif", '2px', '2px'),
  option('Fieldwork', 'Clean white, stadium green and marigold. Coach-like clarity; balanced, roomy content.', true, '#f1f6f2', '#ffffff', '#223d2c', '#526b5b', '#21683e', '#966500', '#ffffff', "'Barlow', sans-serif", '5px', '1px'),
  option('Aqua Club', 'Deep ink, turquoise and strawberry. Softer corners; lively accents without neon glare.', false, '#151b20', '#222e34', '#eff8fa', '#adc4cb', '#68dfcf', '#ff99af', '#152923', "'Space Grotesk', sans-serif", '8px', '1px'),
  option('Signal', 'Chalk, black and safety yellow. High-contrast utility labels; bold monochrome card frames.', true, '#f5f5f2', '#ffffff', '#252621', '#616257', '#55591c', '#ead85c', '#ffffff', "'Chakra Petch', sans-serif", '0px', '2px'),
];
