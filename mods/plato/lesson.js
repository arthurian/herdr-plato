// The PLATO lesson (opened from HELP with L).
// Pure data, no "herdr" import, so Node tests it. Every fact comes from the
// sources named on each page: David R. Woolley, "PLATO: The Emergence of Online
// Community" (1994); LivingInternet, "PLATO"; Brian Dear, "The Friendly Orange
// Glow" (2017); and the PLATO Codex (codex.retro1.org).

export const LESSON = [
  {
    title: "What PLATO was",
    lines: [
      "PLATO began in the early 1960s at the University of Illinois at Urbana.",
      "Professor Don Bitzer, an electrical engineer, wanted to use computers",
      "for teaching. With colleagues he founded the Computer-based Education",
      "Research Laboratory, CERL.",
      "",
      "PLATO was one of the first timesharing systems operated in public.",
      "Teachers wrote lessons in a language called TUTOR, and students used",
      "the same terminals, all connected to one central mainframe.",
      "From about 1972, new mainframes let up to a thousand people use it at once.",
    ],
    source: "Woolley 1994; LivingInternet",
  },
  {
    title: "The terminal and its keys",
    lines: [
      "The PLATO IV terminal had a plasma panel that glowed orange: the",
      "\"friendly orange glow\" of Brian Dear's title.",
      "",
      "PLATO was built to answer every key at once. Each key press went to the",
      "mainframe, and an echo of 100 ms was excellent; over 250 ms was too slow.",
      "One key press stopped a slow screen and moved on.",
      "",
      "The keyset had keys such as NEXT, BACK, HELP, TERM, LAB and DATA,",
      "and the keys of this layout are named after them.",
    ],
    source: "Woolley 1994; Dear 2017; PLATO Codex",
  },
  {
    title: "Notes",
    lines: [
      "In the summer of 1973, Paul Tenczar asked David Woolley, then a",
      "17-year-old junior system programmer, to write a program for bug reports.",
      "",
      "Woolley let each note collect up to 63 responses, so a note could become",
      "a conversation. Notes was released on August 7, 1973.",
      "",
      "Each note fit on one screen of 20 lines, which \"had the virtue of",
      "encouraging brevity\". One key press moved to the next response, and",
      "a HELP key was available everywhere.",
    ],
    source: "Woolley 1994",
  },
  {
    title: "Talkomatic and term-talk",
    lines: [
      "In the fall of 1973, Doug Brown wrote Talkomatic for group chat.",
      "The screen was split into horizontal windows, one per person, and",
      "characters appeared as they were typed. A channel held up to five",
      "people and any number of monitors who could only watch.",
      "",
      "Term-talk followed: press TERM, type \"talk\", and page one person",
      "from anywhere. The page flashed at the bottom of their screen.",
      "A monitor mode later let one person view another's screen.",
    ],
    source: "Woolley 1994; LivingInternet",
  },
  {
    title: "Personal Notes and Group Notes",
    lines: [
      "Kim Mast released Personal Notes, a private mail system, in August 1974.",
      "",
      "At first all public notes shared a few files, and reading them became",
      "a chore. In January 1976 Woolley released Group Notes: any number of",
      "notesfiles, public ones for subjects and private ones for project groups.",
      "Use of Notes \"skyrocketed\".",
      "",
      "In 1978 John Matheny wrote the Notes Sequencer, which took a reader",
      "through everything new in their notesfiles with very few key presses.",
    ],
    source: "Woolley 1994",
  },
  {
    title: "Games and the community",
    lines: [
      "Multiplayer games thrived on PLATO's fast keys and shared memory.",
      "Avatar, a dungeon game, logged about 600,000 hours, and Empire, based",
      "on Star Trek, about 300,000.",
      "",
      "From 1978 to 1985 the CERL system logged 10 million hours. More than a",
      "third of that time was spent in Notes, with about 3.3 million messages",
      "in about 2,000 notesfiles. People talking with people made up at least",
      "half of all use, which PLATO's designers never planned.",
    ],
    source: "Woolley 1994",
  },
  {
    title: "What came after",
    lines: [
      "From 1975 Control Data turned PLATO into a product. By 1985 more than",
      "a hundred PLATO systems ran around the world.",
      "",
      "Lotus Notes was developed by Ray Ozzie, Tim Halvorsen and Len Kawell,",
      "who had all worked at CERL in the late 1970s.",
      "",
      "Control Data's PLATO became CYBIS, and the Illinois system became",
      "NovaNET. A working PLATO system still runs at Cyber1.org.",
    ],
    source: "Woolley 1994; LivingInternet",
  },
  {
    title: "PLATO in this layout",
    lines: [
      "INDEX       Notes opened on an index; you picked an entry from it.",
      "TALKOMATIC  One line per terminal, as Talkomatic gave one window each.",
      "MONITOR     Term-talk's monitor mode: look at another screen.",
      "PAGE        A term-talk page flashing at the bottom of the screen.",
      "NOTES       One notesfile per lesson: a GOAL and numbered responses.",
      "NEXT1       Close to the Notes Sequencer: go to what is new.",
      "DATA        A short response: worked, noticed, next. Brief, like Notes.",
      "TERM, HELP  The PLATO keys, doing what they did then.",
    ],
    source: "Woolley 1994; LivingInternet",
  },
];


/** Lesson paging: Enter, →, space or n go forward; ←, Backspace or p go back. */
export function lessonStep(page, key, n) {
  if (["enter", "right", "space", "n"].includes(key)) return Math.min(n - 1, page + 1);
  if (["left", "backspace", "p"].includes(key)) return Math.max(0, page - 1);
  return null;
}
