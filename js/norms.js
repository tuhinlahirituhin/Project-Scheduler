/* Built-in man-hour norms library. These are INDICATIVE starting values compiled from commonly
   quoted planning ranges; productivity varies widely by country, site, crew and method.
   Users should calibrate them to their own records (the library is fully editable in the app). */
window.PS = window.PS || {};

PS.DEFAULT_NORMS = [
  // Civil & structural
  { id: 'exc-man', cat: 'Civil & structural', name: 'Excavation, manual, ordinary soil', unit: 'm³', mh: 2.5 },
  { id: 'exc-mech', cat: 'Civil & structural', name: 'Excavation, mechanical (operator + helper)', unit: 'm³', mh: 0.15 },
  { id: 'backfill', cat: 'Civil & structural', name: 'Backfilling and compaction in layers', unit: 'm³', mh: 0.8 },
  { id: 'pcc', cat: 'Civil & structural', name: 'Plain cement concrete (PCC), mix, place, compact', unit: 'm³', mh: 6 },
  { id: 'rcc', cat: 'Civil & structural', name: 'Reinforced concrete, place and compact (manual)', unit: 'm³', mh: 8 },
  { id: 'rcc-pump', cat: 'Civil & structural', name: 'Reinforced concrete, pumped', unit: 'm³', mh: 2.5 },
  { id: 'formwork', cat: 'Civil & structural', name: 'Formwork, fabricate, erect and strip', unit: 'm²', mh: 1.8 },
  { id: 'rebar', cat: 'Civil & structural', name: 'Reinforcement, cut, bend and fix', unit: 'MT', mh: 25 },
  { id: 'brick-230', cat: 'Civil & structural', name: 'Brick masonry, 230 mm wall', unit: 'm³', mh: 15 },
  { id: 'block-200', cat: 'Civil & structural', name: 'Concrete block masonry, 200 mm', unit: 'm²', mh: 1.4 },
  { id: 'plaster', cat: 'Civil & structural', name: 'Cement plaster, 12 mm', unit: 'm²', mh: 0.6 },
  { id: 'floor-vdf', cat: 'Civil & structural', name: 'Industrial floor (VDF) finishing', unit: 'm²', mh: 0.35 },
  { id: 'tile', cat: 'Civil & structural', name: 'Floor tiling with bedding', unit: 'm²', mh: 1.0 },
  { id: 'paint', cat: 'Civil & structural', name: 'Painting, primer + 2 coats', unit: 'm²', mh: 0.25 },
  { id: 'waterproof', cat: 'Civil & structural', name: 'Waterproofing membrane', unit: 'm²', mh: 0.4 },

  // Structural steel
  { id: 'steel-fab', cat: 'Structural steel', name: 'Steel fabrication (shop)', unit: 'MT', mh: 35 },
  { id: 'steel-erect', cat: 'Structural steel', name: 'Steel erection and bolting', unit: 'MT', mh: 20 },
  { id: 'steel-paint', cat: 'Structural steel', name: 'Blasting and painting of steel', unit: 'MT', mh: 8 },
  { id: 'roof-sheet', cat: 'Structural steel', name: 'Roof / wall sheeting', unit: 'm²', mh: 0.35 },
  { id: 'grating', cat: 'Structural steel', name: 'Grating and handrail installation', unit: 'm²', mh: 1.2 },

  // Piping
  { id: 'pipe-weld', cat: 'Piping', name: 'Butt weld, carbon steel', unit: 'inch-dia', mh: 1.2 },
  { id: 'pipe-erect', cat: 'Piping', name: 'Pipe erection, up to 6 inch', unit: 'm', mh: 1.5 },
  { id: 'pipe-erect-l', cat: 'Piping', name: 'Pipe erection, 8 to 16 inch', unit: 'm', mh: 3.5 },
  { id: 'valve', cat: 'Piping', name: 'Valve installation, up to 6 inch', unit: 'each', mh: 2.5 },
  { id: 'hydro', cat: 'Piping', name: 'Hydrotest and flushing', unit: 'm', mh: 0.12 },
  { id: 'support', cat: 'Piping', name: 'Pipe supports, fabricate and fix', unit: 'kg', mh: 0.12 },

  // Mechanical
  { id: 'pump', cat: 'Mechanical', name: 'Pump set installation and alignment', unit: 'each', mh: 40 },
  { id: 'static-eq', cat: 'Mechanical', name: 'Static equipment erection', unit: 'MT', mh: 12 },
  { id: 'duct', cat: 'Mechanical', name: 'HVAC ducting, fabricate and install', unit: 'm²', mh: 1.2 },
  { id: 'insul', cat: 'Mechanical', name: 'Pipe insulation with cladding', unit: 'm', mh: 0.8 },

  // Electrical & instrumentation
  { id: 'cable', cat: 'Electrical & instrumentation', name: 'Power cable laying, up to 4C x 95 mm²', unit: 'm', mh: 0.15 },
  { id: 'cable-term', cat: 'Electrical & instrumentation', name: 'LT cable termination', unit: 'each', mh: 1.5 },
  { id: 'tray', cat: 'Electrical & instrumentation', name: 'Cable tray installation', unit: 'm', mh: 0.6 },
  { id: 'conduit', cat: 'Electrical & instrumentation', name: 'Conduit with wiring', unit: 'm', mh: 0.35 },
  { id: 'light', cat: 'Electrical & instrumentation', name: 'Light fixture installation', unit: 'each', mh: 1.5 },
  { id: 'panel', cat: 'Electrical & instrumentation', name: 'Panel / switchboard installation', unit: 'each', mh: 16 },
  { id: 'earthing', cat: 'Electrical & instrumentation', name: 'Earthing strip / conductor', unit: 'm', mh: 0.3 },
  { id: 'instr', cat: 'Electrical & instrumentation', name: 'Field instrument installation', unit: 'each', mh: 4 },
  { id: 'loop', cat: 'Electrical & instrumentation', name: 'Loop check', unit: 'loop', mh: 3 },

  // Interiors
  { id: 'ceiling', cat: 'Interiors & fit-out', name: 'Gypsum false ceiling', unit: 'm²', mh: 0.8 },
  { id: 'partition', cat: 'Interiors & fit-out', name: 'Drywall partition', unit: 'm²', mh: 1.2 },
  { id: 'door', cat: 'Interiors & fit-out', name: 'Door installation with hardware', unit: 'each', mh: 4 },

  // Engineering & office
  { id: 'eng-drawing', cat: 'Engineering & office', name: 'Engineering drawing, A1 sheet', unit: 'drawing', mh: 40 },
  { id: 'doc-review', cat: 'Engineering & office', name: 'Document review and comments', unit: 'document', mh: 4 },
  { id: 'calc', cat: 'Engineering & office', name: 'Design calculation note', unit: 'document', mh: 24 },
  { id: 'boq', cat: 'Engineering & office', name: 'Bill of quantities preparation', unit: 'page', mh: 3 },

  // Software & IT
  { id: 'fp', cat: 'Software & IT', name: 'Development effort per function point', unit: 'FP', mh: 8 },
  { id: 'screen', cat: 'Software & IT', name: 'UI screen, medium complexity', unit: 'screen', mh: 16 },
  { id: 'api', cat: 'Software & IT', name: 'API endpoint with tests', unit: 'endpoint', mh: 12 },
  { id: 'tc-write', cat: 'Software & IT', name: 'Test case writing', unit: 'test case', mh: 1 },
  { id: 'tc-run', cat: 'Software & IT', name: 'Test case execution', unit: 'test case', mh: 0.5 },
  { id: 'doc-page', cat: 'Software & IT', name: 'Technical documentation', unit: 'page', mh: 2 },
];
