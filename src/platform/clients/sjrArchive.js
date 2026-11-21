/**
 * The Social Justice Radio archive, as listed on
 * https://socialjusticeradio.onelouder.ca/ (read 2026-11-21): every audio
 * file, by season, newest first, exactly as named on the server. Files live
 * under /shows/SJR/ (the Radio Ada shows under /shows/). Names are kept as
 * they are, typos included, because they are the links.
 *
 * Seasons 3 has no files in the archive. The last block ("early") had no
 * season heading on the page; it sits after Season 2, so it is filed as
 * Season 1 and flagged.
 */
export const SJR_BASE = 'https://socialjusticeradio.onelouder.ca/shows/SJR/';
export const ADA_BASE = 'https://socialjusticeradio.onelouder.ca/shows/';

/** Season → [start year of the academic year, files newest first]. */
export const SJR_SEASONS = {
  14: [2026, `SJR-S14-E9-AI DATA CENTER.mp3
SJR-S14-E8-metacrisis update.mp3
SJR-S14-E7-Rooted in Struggle Book Launch.mp3
SJR-S14-E6-Treaty Day - for Radio.mp3
SJR-S14-E5-tbtn rally ep.mp3
SJR-S14-E4-Hunter's Mountain rewind.mp3
SJR-S14-E3-John Gaventa Just Transition Lecture.mp3
SJR-S14-E2-Maria and Fiona.mp3
SJR-S14-E1-Welcome back.mp3`],
  13: [2025, `SJR-S13-E23-wrapupshow2026 and AROYH.mp3
SJR-S13-E22-Podcast devs 311-fiona_morgan.mp3
SJR-S13-E21-rally show.mp3
SJR S13-E20-panel march 10 EDIT.mp3
SJR-S13-E19-StFX's Plowing Problem.mp3
SJR-S13-E18-antigonishcoalitiontoendpoverty.mp3
SJR-S13_E17-Divest Dal.mp3
SJR-S13-E16-WEB VER feb 04.mp3
SJR-S13-E15-sjr student strike.mp3
SJR-S13-E14-STFX Pride.mp3
SJR-S13-E13-2nd semester overview show.mp3
SJR-S13-E12-DEVS 412 FINAL.mp3
SJR-S13-E11-shoulder to shoulder.mp3
SJR-S13-E10-Living as Trans People in Nova Scotia.mp3
SJR-S13-E9-sjralbertmarshalltalk.mp3
SJR-S13-E8-episode halloween.mp3
SJR-S13-E7-Senator Kim Pate talk.mp3
SRJ-S13-E6-Use of AI for studying plus outro.mp3
SJR-S13-E5-Hunter's Mountain & Bill 127.mp3
SJR-S13-E4-activist-stories.mp3
SJR-S13-E3conflict mediationl.mp3
SJR-S13-E2-GNSF final.mp3
SJR-S13-E01-DFA-precarious-employment.mp3`],
  12: [2024, `SJR S12 Apr 10 Sexual Violence Prevention Week.mp3
SJR S12 Apr 3 William Rochon SJR Podcast.mp3
SJR S12 Mar 27 Sophie G and Ella - Podcast.mp3
SJR S12 Mar 20 Sister Stan Podcast.mp3
SJR S12 Mar 13 Podcast MayaBergeron.mp3
SJR S12 Mar 6 - Women in Antigonish Movement final.mp3
SJR S12 Feb 27 - African drumming.mp3
SJR S12 Feb 13 - Global Issues Forum Final Draft 1.mp3
SJR S12 Jan 30 - Enviro Ed and CLEN.mp3
SJR S12 Jan 23 - Priscilla 20th Anniversary Episode.mp3
SJR S12 Jan 16 - Enviro Ed - Cole Lotta Love (Rhys and Cole).mp3`],
  11: [2023, `SJR S11 - Noah funeral tribute.mp3`],
  10: [2022, `SJR Bonus Last Episode.mp3
SJR 10th Anniversary - part 2.mp3
SJR Migration Podcast - Federica Frazetta.mp3
SJR 10th Anniversary Reflection.mp3
SJR Elizabeth May.mp3
SJRIWWEmbrace Equity Coady.mp3
International Women's Week 2023.mp3
SJR TBTN Feb 16.mp3
SJR Paolo Freire on Love.mp3
SJR Feb 2 2023.mp3
SJR Jan19 - Investigative Journalism in Ghana.mp3
SJR Jan 12, 2023 - Reseed - Media, Stories, and Culture Reclaimed.mp3
SJR CLP - Zodwa and Updates.mp3
SJR-Migration Podcast Dec 8 - Jack Beaton SAFE.mp3
SJR-Migration Podcast Intro - Oct 27th-rev.mp3
SJR - Dec 1 devs 311 show .mp3
SJR - Community firdge and poverty reduction - devs 311 podcast.mp3
SJR - Social. Justice Radio - DEVS 311.mp3
SJR Poverty and Update Discussion.mp3
sjr-Day of the Dead.mp3
SJR - Nurturing Netukulimk and Dal Strike.mp3
SJR NOII Migrant Justice Segment.mp3
SJR - Abahlali baseMjondolo Podcast Final Copy (mp3).mp3
SJR - SRAN - Loretta and Albert Podcast (EDITED VERSON).mp3
SJR - Radio Ada FINAL FINAL RA Pod - Amanor.mp3
SJR SE10 Global Climate Strike and Hurricane Fiona.mp3
SJR Episode 1 2022.mp3`],
  9: [2021, `SE09_04_21_2022_Music for Therapy and Social Justice.mp3
SJR - SE 09_04_14 Walking as Pedadogy Podcast.wav
SJR SE 09_04_07 Reactions to Climate Plan and IPCC Report.mp3
SJR_SE9_03_31_2022_Clutch Conversation_Celebrting Black Culture.mp3
SJR_SE9_03_24_2022_Resistance, Creativity, and Connection in Ukraine.mp3
SJR_SE9_03_10_2022_Migration Borders Action Research Panel.mp3
SJR_SE9_World Radio Day.mp3
SJR_SE9_02_10_Migration Borders Action Research Intro.mp3
SJR_SE9_02_03_2022_acadia.freedomconvoy.mp3
SJR_SE9_01_27_2022_BTS Mining Resistance.mp3
SJR_SE9_01_20_2022_Radio Ada Attack.mp3
SJR_SE9_01_13_2022_RA Reflection.mp3
SJR_SE9_12_02_2021_Dismantling Whiteness.mp3
SJR_SE9_11_25_2021_Housing Crisis.mp3
SJR SE 09_Nov 18 farmers protest.mp3
SJR_SE9_11_04_2021_COP26 and Climate Justice.mp3
SJR_SE9_10_28_2021- Sexual Violence Prevention.mp3
SJR_SE9_10_21_2021- Climate Justice.mp3
SJR SE 09_Oct 7th.mp3
SJR_SE9_09_30_2021_Learning Lodge.mp3
SJR_SE9_Antigonight - Yami - Judy.mp3
SJR_SE9_09_16_2021_Goldboro.mp3`],
  8: [2020, `SJR - decolonizing curriculum.mp3
SJR_March24_KeppochDEVS311.mp3
SJR_March18_BTS311.mp3
SJR_S8-anti-racism show-final.mp3
SJR_RachelZellers.mp3
FEB18_BookLaunch.mp3
FEB11_QueerInQuarantine.mp3
SJR_FEB4_LawrenceHill.mp3
SJR_SE8_11_05-finishery show.mp3
SJR_Oct22_SARS.mp3
SJR_SE8_10_08_2020 -week of boye podcast.mp3
SJR_SE8_09-24-2020-2.mp3
SJR_SE8_02_09-17-2020.mp3
SJR_SE8_01_09-10-2020.mp3`],
  7: [2019, `SJR_S7 special podcast on Wet'suwe'ten and Stop Alton gas movements.mp3
FinalHist299Podcast.mp3
RELS399_MartinStreetClip.wav
SJR_FEB27_SHUTDOWNCANADA.wav
SJR_FEB6_BellLetsTalk.wav
SJR_JAN30_SocialEnterprises.wav
SJR_DEC5_REA.wav
SJR_Nov21_NaomiSocietyAndSoloist.wav
SJR_Nov28_SJR_StudentAdvisors.mp3
SJR_Nov7_YAC.mp3
AntigonishCommunityTransit.mp3
SJR_Chile.wav
keppochshow.mp3
SJR_S07Ep2Pt2_HurricaneDorian.wav`],
  6: [2018, `SJR_S06_13_final panel DEVS 311 2019.wav
SJR_S06_12_panel2-SJR.wav
SJR S06_11_panel1-SJR.wav
SJR_S06_9_Aboriginal Affairs and African Descent Offices.wav
SJR_S06_8-Student Sexual Health_Mar21.wav
SJR_S06_7-Social Justice Radio_Mar21.m4a
SJR_S06_6_Keppoch_Mar13.mp3
SJR_S06_5-Student Life_Mar13.m4a
SJR_S06_4-REA_Mar7.wav
SJR_S06_3-ESRN_Mar7.mp3
SJR_S06_2-YAC_Feb28.mp3
SJR_S06_1-IICRD_Feb28.mp3`],
  5: [2017, `SJR_S05_03_29_YAC.wav
SJR_S05_03_15Matt and Julia Podcast.wav
SJR_S05_03_08Meaghan Landry Podcast.wav
SJR_S05_03_01 Kate and Jeni Podcast .wav`],
  4: [2016, `SJR_S04_BTS_Family_Violence 2.mp3
SJR_S04_YAC.mp3
SJR_REA_podcast_2017.mp3
SJR_S04_Teen_Mental_Health_and_Oceanpath.mp3
SJR_S04_Meal_Exchange_African_Descent.mp3
SJR community radio - Jan 12 - 2017.mp3
SJR_S04_Accessibility.mp3
Muskrat Falls Dam Segment.mp3
SJR_S04_Songs as Struggle in Ghana.mp3
SJR_Sept29.mp3`],
  2: [2014, `SJR June 18th Food Justice.mp3
8 SJR March 12th YAC office for students of african descent.mp3
7 SJR March 5th ACT and REA.mp3
4 SJR February 26 Show.mp3
3 SJR Feb 19th AWRC Positive Space.mp3
6 SJR Feb. 12 African Heritage Month.mp3
2 SJR Racism on Campus Jan 29th.mp3
5 SJR Community Radio Ada Show Jan 22.mp3
1 SJR Songs for Justice jan 15.mp3
SJR NUTRITION FOOD SECURITY NOV 27.mp3
SJR Jen Moore MP3 Nov20th.mp3
SJR CJ WILLIE FINAL MP3.mp3
coady.mp3
Ebola.mp3
SJR TASK FORCE.mp3
SJR POVERTY OCT 16th FINAL.mp3
SJR OcTOBER 9 GENDERVIOLENCESHOW.mp3
SJR-fracking-season2.mp3
SJR MOON FESTIVAL FINAL.mp3
SJR FALL HARVEST FINAL.mp3
SJR-INTERNSHIPS.mp3`],
  1: [2013, `YAC-BEA.m4a
REA-EFF.m4a
immersion.m4a
FarmersMarketHomelessness.m4a
Inclusivity.m4a
fossilfuel.m4a
TreatyDay.mp3
TakeBacktheNight.mp3
LocalFood.mp3
LanguageandCulture.mp3
Rajagopal.mp3
Halloween.mp3
AntiFracking.mp3`],
};

/** The Radio Ada partnership show ("Call and Response"), oldest first: [file, title]. */
export const RADIO_ADA = [
  ['1.mp3', 'Songor'],
  ['2.mp3', 'Livelihoods'],
  ['3.mp3', 'Language'],
  ['4.mp3', 'Radio Ada on CFXU'],
  ['5.mp3', 'Radio Ada complete: Language'],
  ['6.mp3', 'Radio Ada episode 2'],
  ['7.mp3', 'Radio Ada episode 6: Education'],
  ['8.mp3', 'Radio Ada production on education (StFX)'],
  ['9.mp3', 'Traditional music, 2012'],
  ['10.mp3', 'Women and livelihoods'],
  ['11.mp3', 'YAC'],
];
