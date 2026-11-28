/**
 * EoViz's helper docs (stage 1): one source, two places, like Place and
 * Rhizome. Help carries this section (help.html#eoviz/<page>) and EoViz's
 * About tab shows the same pages.
 */
export const EOVIZ_HELP_ID = 'eoviz';

export const EOVIZ_HELP = {
  id: EOVIZ_HELP_ID,
  title: 'EoViz (experimental)',
  icon: 'sec-eoviz',
  blurb: 'The eco data lens: water, air and soil data from loggers, sondes, labs and open data, kept with its units and flags, and drawn well.',
  pages: [
    {
      id: 'eoviz-start',
      title: 'EoViz, the eco data lens',
      body: `**EoViz** is for the people who watch the water, air and soil around them: a volunteer stream group, a guardians programme, a chemist on a research vessel.

- **Partners**: each group has its own sites, files and dashboard. Its data stays its own unless it chooses to open it.
- **Files**: bring in what your instruments and labs write. EoViz knows fourteen file types and reads each one to its spec.
- **Sites and readings**: every reading keeps its unit, its depth and its flag (below detection, estimated, questioned). Nothing is changed silently.
- **Finder**: EoViz reads the shape of your data (one sensor, many sites, a depth profile, a spectrum) and ranks the charts that suit it.
- **Sketchbook**: the same data as drawings, for a campaign, a wall or a council meeting.

# Switching EoViz on
EoViz is off until your organisation switches it on, in **Organisation → Plugins**.`,
    },
    {
      id: 'eoviz-files',
      title: 'File types and the specs behind them',
      body: `EoViz reads files the way working scientists write them. Each type on the **Formats** tab links to its spec, and has a **mock** file to try: made-up numbers in the real layout.

# Families
- **Tables**: a spreadsheet saved as CSV; DataStream's open schema; the US Water Quality Exchange (WQX).
- **Loggers and sondes**: Onset HOBO, Solinst Levelogger (.xle), YSI EXO sondes.
- **Profiles**: Sea-Bird CTD casts (.cnv) and bottle files (.btl).
- **Lab results**: a lab's electronic data deliverable (EDD), a TOC analyser's export, JCAMP-DX spectra.
- **Government open data**: WaterML 2.0 time series; netCDF CF grids (as CDL text for now).
- **Air**: OpenAQ and PurpleAir.
- **Places**: GeoJSON sites.

# Excel and binary netCDF
Save Excel sheets as CSV for now. Binary netCDF comes in a later stage; CDL (ncdump's text) works today.`,
    },
    {
      id: 'eoviz-vessel',
      title: 'At sea: casts, bottles and carbon',
      body: `The vessel workflow joins three files into one picture of dissolved carbon by depth.

1. **The cast** (.cnv): the CTD's continuous readings on the way down: temperature, salinity, oxygen, chlorophyll.
2. **The bottles** (.btl): written as the rosette fires each bottle on the way up. Each bottle's number, the time it closed, and the depth.
3. **The lab** (TOC analyser export): NPOC (read as DOC) and IC (read as DIC) for each sample, in mg C/L. EoViz converts to µmol/L.

Sample IDs carry the cast and bottle (*KB25-07 C04 B07*). When the lab file comes in, EoViz matches each sample to its bottle, so each reading gets its depth and the time it was taken, not the time it was run. Check standards, blanks and excluded injections are left out and counted. A sample with a high CV is flagged *questioned*, and drawn hollow.

The **At sea** page shows the three steps and the joined profile: the cast as lines, the bottles as dots.`,
    },
    {
      id: 'eoviz-finder',
      title: 'The viz finder',
      body: `The finder looks at a dataset and asks: how many sites? how many parameters? how often, and for how long? is there a depth, a wavelength, a grid? From that it names the **shape**, and scores every chart for it.

| Shape | Good first charts |
|---|---|
| One sensor, every few minutes | Line with guideline, day-cycle heatmap, horizon |
| One sensor, a year or more | Calendar heatmap, seasonal rings |
| Many parameters at one site | Lab bench strip, parameter pairs |
| One parameter at many sites | Site strip plot, distribution by site |
| A cast or bottles by depth | Depth profile |
| A mooring: depth by time | Depth by time |
| A spectrum | Spectrum with peaks |

Each suggestion says why it fits. Charts are for reading; the **Sketchbook** is for feeling: the river ribbon, the breathing creek, the process drawing.`,
    },
    {
      id: 'eoviz-guides',
      title: 'Guide values, flags and care',
      body: `Dashboards draw a dashed **guide value** where there is one: CCME water and soil quality guidelines, Health Canada's recreational water guideline for E. coli, the Canadian Ambient Air Quality Standards. They are guides: check the one that applies to your water body, its use and your province.

# Flags
- **<** below the detection limit: drawn hollow at the limit.
- **>** above the instrument's range.
- **e** estimated; **q** questioned.

# Care with data
A partner's data is its own. A site can be **held back**: its place is not shown outside the group (a harvesting spot, a nest). Indigenous guardians' data follows the group's own rules (OCAP).`,
    },
    {
      id: 'eoviz-ocean',
      title: 'The ocean studio: data, windows and 3D',
      body: `For ocean scientists: cruises, floats and moorings, side by side.

# Ocean data
EoViz keeps ocean observations in four dimensions: where, when, how deep, what. One **collection** is one cruise, one float's track or one mooring. EoViz reads:
- **GLODAP** merged product extracts (CSV, G2… columns). GLODAP is open under CC BY 4.0: cite the version you use.
- **WOCE / CCHDO bottle exchange** files, with their _FLAG_W columns.
- **Profiling floats** in Argo-style CSV, with _QC columns (mapped to WOCE flags).
- **Mooring** CSVs, with “# mooring:”, “# lat:” and “# lon:” lines.

Every value keeps its **flag** (WOCE: 2 good, 3 questionable, 4 bad, 9 not sampled) and every collection its **citation**. Nothing is changed: a window chooses which flags to keep. EoViz works out **σθ** (EOS-80 at the surface; use TEOS-10 for a paper) and **AOU** (Garcia and Gordon 1992) from values that pass.

# Windows
A window is a small view of the data, made of four chips:
- **Data**: a cruise line, a mooring array or a float fleet, your own or shared by your network.
- **Query**: the variable, the depths, and good flags or all.
- **Time**: all years, one year, a season, or a run of years.
- **Form**: section, profile, T–S (with density lines), time series, Hovmöller, scatter or map.

**Vary** a chip to make a sibling window (the next year, the next variable, the next form). **Link** windows and their time slices move together. Colours keep one scale across a set's years, so two years side by side compare honestly. The **starter gallery** has a dozen windows to begin from.

# The 3D studio
Switch on **Studio** on the windows you want, and they meet in one space: a cruise as a **bottle cloud** and a **curtain** along the line, floats as **ribbons** along their tracks at each depth, moorings as a **helix** that turns once a year. Stretch the depth, turn the view, save a picture.

# From the network
When your organisation is linked to others (Organisation → Network), what they share appears on Ocean data and in every window, cited to the org that holds it.`,
    },
  ],
};
