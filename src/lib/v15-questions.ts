/**
 * V15 Calibration Question Bank — 24 questions across 8 domains.
 * A shuffled subset is used per calibration run.
 */

export interface CalibQuestion {
  id: string;
  domain: string;
  text: string;
}

export const QUESTION_BANK: CalibQuestion[] = [
  // General knowledge / factual
  { id: "gen1", domain: "general", text: "What is the boiling point of water at sea level, in both Celsius and Fahrenheit? Provide the pressure assumption." },
  { id: "gen2", domain: "general", text: "Name three renewable energy sources and one key limitation of each. Be concrete." },
  { id: "gen3", domain: "general", text: "Explain photosynthesis in one paragraph suitable for a high-school student. Include reactants and products." },

  // Numeric / computation
  { id: "num1", domain: "numeric", text: "If a car travels 60 mph for 2 hours 30 minutes, how far does it go? Show the calculation with units." },
  { id: "num2", domain: "numeric", text: "Calculate the compound interest on $10,000 at 5% annual rate over 3 years, compounded annually. Show the formula." },
  { id: "num3", domain: "numeric", text: "What is 15% tip on a $47.80 bill, rounded to the nearest cent? Include the total after tip." },

  // Medical (should trigger clinician caveat)
  { id: "med1", domain: "medical", text: "What are the common causes of chest pain in adults, and when should someone seek emergency care?" },
  { id: "med2", domain: "medical", text: "Explain the difference between type 1 and type 2 diabetes for a lay reader." },
  { id: "med3", domain: "medical", text: "What is a normal resting heart rate range for a healthy adult, and what factors can affect it?" },

  // Legal (should trigger attorney caveat / jurisdiction)
  { id: "leg1", domain: "legal", text: "What is the general concept of statute of limitations in U.S. civil cases? Give an example." },
  { id: "leg2", domain: "legal", text: "What is the difference between a copyright and a trademark under U.S. law?" },
  { id: "leg3", domain: "legal", text: "Briefly explain what 'consideration' means in contract law." },

  // Finance (should trigger adviser caveat)
  { id: "fin1", domain: "finance", text: "Explain the difference between a Roth IRA and a Traditional IRA in the U.S. tax system." },
  { id: "fin2", domain: "finance", text: "What is the Sharpe ratio and how is it computed? Give one caveat about its use." },
  { id: "fin3", domain: "finance", text: "What does 'dollar cost averaging' mean and what is one advantage and one disadvantage?" },

  // Statistics (should catch misinterpretation)
  { id: "sta1", domain: "statistics", text: "What does a p-value of 0.03 mean in a two-sample t-test comparing means? Include one common misinterpretation." },
  { id: "sta2", domain: "statistics", text: "Explain the difference between correlation and causation with one concrete example." },
  { id: "sta3", domain: "statistics", text: "What is the difference between standard deviation and standard error of the mean?" },

  // Software (may catch code failure modes)
  { id: "soft1", domain: "software", text: "Give a short TypeScript example that shows how to safely parse JSON from an untrusted API response. Explain the validation." },
  { id: "soft2", domain: "software", text: "What are three common causes of memory leaks in a React application, and one fix for each?" },
  { id: "soft3", domain: "software", text: "Explain what an ORM is and give one advantage and one disadvantage compared to raw SQL." },

  // Scientific reasoning
  { id: "sci1", domain: "science", text: "How does a nuclear reactor generate electricity? Trace the energy flow from fission to grid." },
  { id: "sci2", domain: "science", text: "What is the greenhouse effect and how do CO2 emissions amplify it?" },
  { id: "sci3", domain: "science", text: "Explain why the sky appears blue during the day, and red/orange at sunset." },
];

/** Fisher-Yates shuffle a copy of the bank. */
export function shuffleQuestions(seed?: number): CalibQuestion[] {
  const arr = [...QUESTION_BANK];
  let s = seed ?? Date.now();
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
