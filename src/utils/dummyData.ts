// Back-compat shim. The sample-data engine + the four age-bracket personas now
// live in src/utils/sampleData/. `loadDummyData()` (no arg) loads the default
// young-professional persona; surfaces that let the user pick a profile should
// import `loadSampleData(bracket)` from './sampleData' directly.
export { loadSampleData as loadDummyData } from './sampleData';
