// Ledger lines for choices whose events don't write one, so a year's entry shows what you decided.
// Plain refusals that change nothing (no lottery ticket, skipping a check-up) stay out of the ledger.

import { aTitle, lc } from "../format";
import { fmt, W, type Offer } from "../ops";
import type { Decision, LifeState, Tone } from "../types";
import { countryIn, countryName } from "../world";

type Line = string | [string, Tone];
type Write = (s: LifeState, d: Decision, label: string) => Line | null;

const said = (d: Decision, k: string) => String(d.payload?.[k] ?? "");
const amount = (s: LifeState, d: Decision, k: string) => fmt(s, Number(d.payload?.[k] ?? 0));
/** A phrase lifted from the decision's own text. */
const grab = (d: Decision, re: RegExp) => d.body.match(re)?.[1] ?? "";
const parent = (d: Decision) => (Number(d.payload?.i) === 0 ? "mother" : "father");
const partnerName = (s: LifeState) => s.partner?.name ?? "your partner";

const WINDFALLS: Record<string, string> = {
  "A tax refund": "a tax refund",
  "A bonus": "your bonus",
  "A prize draw": "a prize-draw win",
  "An old debt repaid": "an old debt repaid to you",
};
const windfall = (d: Decision) => WINDFALLS[d.title] ?? lc(d.title);

const LINES: Record<string, Write> = {
  // childhood and school
  "temperament:social": () => "A toddler glued to the other kids.",
  "temperament:careful": () => "A careful, watchful toddler.",
  "temperament:curious": () => "A toddler into everything.",
  "temperament:bold": () => "A fearless toddler who climbs everything.",
  "school_focus:books": () => "At school, books and top marks are your world.",
  "school_focus:friends": () => "At school, it's all friends and sport.",
  "school_focus:dream": () => "At school, you draw and daydream.",
  "school_focus:help": () => "Out of school, you help out at home.",
  "no_school:learn": () => "With no school, you teach yourself what you can.",
  "no_school:trade": () => "With no school, you learn a trade from a neighbour.",
  "no_school:work": () => "With no school, you work alongside your family.",
  "pocket_money:spend": (s, d) => `You spend your first money, ${amount(s, d, "amt")}, on something fun.`,
  "teen_gadget:save": (_s, d) => `You save up for ${grab(d, /has (.+?)\. It costs/) || "the thing everyone has"}.`,
  "teen_gadget:ask": (_s, d) => [`You beg your parents, and they buy you ${grab(d, /has (.+?)\. It costs/) || "one"}.`, "good"],
  "teen_gadget:used": (_s, d) => `You hunt down a second-hand ${(grab(d, /has (?:an? |the )?(.+?)\. It costs/) || "one").replace(/^latest /, "")}.`,
  "teen_job:spend": () => ["You take a weekend job and enjoy the money.", "money"],
  "teen_job:sport": () => "You spend your weekends on the team instead of working.",
  "teen_job:study": () => "You study instead of taking a weekend job.",
  "stay_in_school:stay": () => "Your family needs the money, but you stay in school.",
  "exam_year:coast": () => "You coast through exam year.",
  "exam_year:alone": () => "You grind alone through exam year, every evening.",
  "exam_year:group": () => "You study for your exams with friends.",
  "exam_year:tutor": () => "Your family pays for a private tutor in exam year.",
  "smoking:start": () => ["You start smoking.", "bad"],
  "smoking:parties": () => "You only smoke at parties.",
  "moving_out:stay": () => "You stay in your old room at your parents' to save.",

  // love and family
  "romance:yes": (_s, d) => [`You start seeing ${said(d, "name")}.`, "good"],
  "romance:slow": (_s, d) => `You and ${said(d, "name")} take it slowly.`,
  "romance:prenup": (_s, d) => `You start seeing ${said(d, "name")}, with a prenup in mind if it gets serious.`,
  "romance:no": (_s, d) => `You meet ${said(d, "name")}, but now isn't the time.`,
  "wedding:wait": (_s, d) => `${d.body.split(" wants")[0]} wants to get married. You're not ready yet.`,
  "baby:later": (s) => `You and ${partnerName(s)} decide to wait a couple of years for children.`,
  "baby:never": (s) => `You and ${partnerName(s)} decide not to have children.`,
  "school_choice:local": (_s, d) => `${said(d, "name")} starts at the school down the road.`,
  "school_choice:private": (_s, d) => [`${said(d, "name")} starts at a private school.`, "money"],
  "school_choice:area": (_s, d) => [`You move near the best state school for ${said(d, "name")}.`, "money"],
  "kid_hobby:pay": (_s, d) => [`You pay for ${grab(d, /wants (.+?)\. It would/) || "lessons"} for ${said(d, "name")}.`, "money"],
  "kid_hobby:cheap": (_s, d) => `${said(d, "name")} wants ${grab(d, /wants (.+?)\. It would/) || "something"}. You find something cheaper.`,
  "kid_college:loans": (_s, d) => `${said(d, "name")} goes to university on student loans.`,
  "kid_college:pay": (s, d) => [`You pay for ${said(d, "name")}'s university: about ${amount(s, d, "cost")} over four years.`, "money"],
  "kid_college:half": (_s, d) => [`You pay half of ${said(d, "name")}'s university. They borrow the rest.`, "money"],
  "kid_college:local": (_s, d) => `${said(d, "name")} goes to a cheaper university and lives at home.`,
  "kid_college:no": (_s, d) => `You tell ${said(d, "name")} to get a job instead of going to university.`,
  "kid_deposit:no": (_s, d) => `${said(d, "name")} has to find a first-home deposit without you.`,
  "boomerang:yes": (_s, d) => `${said(d, "name")} lost their job and moves back home.`,
  "boomerang:rent": (_s, d) => [`${said(d, "name")} lost their job. You help with their rent.`, "money"],
  "boomerang:no": (_s, d) => `${said(d, "name")} lost their job. You tell them to stand on their own feet.`,
  "childcare:paid": () => ["You pay for childcare while you both work.", "money"],
  "parents_support:yes": () => ["You start supporting your parents: about 8% of your income.", "money"],
  "parents_support:some": () => ["You send your parents what you can.", "money"],
  "parents_support:no": () => "Your parents need help. You can't afford it.",
  "care_change:payfee": (_s, d) => [`Your ${parent(d)}'s care home raises its fees. You pay.`, "money"],
  "care_change:cheaper": (_s, d) => `You move your ${parent(d)} to a cheaper care home.`,
  "care_change:send": (_s, d) => [`You send money every year for your ${parent(d)}'s care.`, "money"],
  "care_change:leave": (_s, d) => `You leave your ${parent(d)}'s care to your siblings.`,
  "pet:foster": (_s, d) => `You foster a ${said(d, "pet") || "pet"} for a few months.`,
  "sibling_loan:no": () => "Your sibling asks for money to save their business. You say no.",
  "remit:monthly": (_s, d) => [`You start sending a tenth of your pay home to ${grab(d, /back in (.+?) is/) || "your family"}.`, "money"],
  "remit:lump": (_s, d, label) => [`You send ${label.replace(/^Send /, "").replace(/ once$/, "")} home to ${grab(d, /back in (.+?) is/) || "your family"}.`, "money"],

  // work
  "job_offer:stay": (_s, d) => {
    const of = d.payload?.of as Offer | undefined;
    return of ? `You turn down an offer to be ${aTitle(of.title)} at ${of.employer}.` : null;
  },
  "promotion:no": (_s, d) => `You turn down ${d.body.match(/a job as (an? .+?):/)?.[1] ?? `a promotion to ${grab(d, /to (.+?): /) || "the next rung"}`}.`,
  "promotion:stay": () => "Your boss leaves. You stay out of the race for the job.",
  "overtime:all": () => ["You take every overtime shift going.", "money"],
  "overtime:some": () => ["You take some overtime.", "money"],
  "burnout:push": () => ["Running on empty, you push through. Your health takes the hit.", "bad"],
  "burnout:break": () => "Burnt out, you take three months off.",
  "industry_trouble:stay": () => "Cuts are coming at work. You keep your head down.",
  "industry_trouble:retrain": () => "With cuts coming at work, you start retraining at night.",
  "strike:cross": () => "Your union walks out. You keep working.",
  "credit_thief:let": () => "Your manager takes credit for your project. You let it go.",
  "credit_thief:leave": () => "Your manager takes credit for your project. You start looking for another job.",
  "transfer:commute": () => "You take a transfer and come home at weekends.",
  "night_school:enrol": (_s, d) => [`You enrol in an evening course in ${said(d, "subject")}.`, "money"],
  "night_school:cheap": (s, d) => `You teach yourself ${said(d, "subject")} ${s.year >= 2010 ? "online" : "from library books"}.`,
  "retrain:night": () => "You start retraining at night while you work.",
  "retire:work": () => "You could stop working now. You keep going.",
  "gig_work:evenings": () => ["You sign up with the delivery apps, every evening.", "money"],
  "gig_work:weekends": () => ["You deliver for the apps at weekends.", "money"],
  "lockdown:home": () => "Lockdown: you work from home and save.",
  "lockdown:deliver": () => ["Lockdown: you pick up delivery work.", "money"],
  "lockdown:wait": () => "Lockdown: you wait it out.",
  "lockdown:learn": () => "Lockdown: you use the time to learn something.",
  "startup_offer:stay": (_s, d) => `You turn down a job at ${said(d, "name") || "a startup"}, a startup, and stay where it's safe.`,
  "new_field:side": () => ["You use your new certificate for freelance work on the side.", "money"],
  "new_field:stay": () => "Your new certificate goes in a drawer.",
  "hustle_grows:stop": () => "Your side business is taking off. You wind it down.",
  "midlife:nothing": () => "A midlife wobble. Nothing changes.",
  "midlife:sabbatical": () => ["You take a year off.", "money"],
  "midlife:car": () => ["You buy the car you always wanted.", "money"],

  // money
  "windfall:invest": (s, d) => [`You invest ${windfall(d)}: ${amount(s, d, "amt")}.`, "money"],
  "windfall:treat": (s, d) => [`You spend ${windfall(d)} on yourself: ${amount(s, d, "amt")}.`, "money"],
  "windfall:share": (s, d) => [`You share ${windfall(d)} with your family: ${amount(s, d, "amt")}.`, "money"],
  "windfall:debt": (s, d) => [`${windfall(d)[0].toUpperCase()}${windfall(d).slice(1)} goes on your debts: ${amount(s, d, "amt")}.`, "money"],
  "big_trip:go": (s, d) => [`You go on ${grab(d, /planning (.+?)\. Your share/) || "a trip"}: ${fmt(s, Number(d.payload?.cost ?? 0) * W(s))}.`, "money"],
  "big_trip:cheap": (_s, d) => [`You go on ${grab(d, /planning (.+?)\. Your share/) || "a trip"}, on the cheap.`, "money"],
  "first_car:transit": (s) => (s.year >= 1975 ? "No car: you get around by public transport and bicycle." : "No car: you walk and take the bus."),
  "first_car:used": () => ["You buy a used car, paid in cash.", "money"],
  "first_car:bike": () => ["You buy a motorbike.", "money"],
  "credit_card:full": () => "You take a credit card, and pay it off every month.",
  "credit_card:no": () => "A bank offers you a credit card. You cut it up.",
  "card_debt:min": () => ["Your credit card is still full. You keep paying the minimum.", "bad"],
  "debt_crisis:pay": () => ["Drowning in debt, you keep paying.", "bad"],
  "inflation_spike:stay": () => "Prices are racing up. You leave your savings where they are.",
  "bank_run:keep": () => "Queues form outside the banks. You leave your money in.",
  "savings_circle:join": (_s, d) => [`You join ${lc(d.body.split(":")[0])}.`, "money"],
  "savings_circle:first": (_s, d) => [`You join ${lc(d.body.split(":")[0])} and take the first pot.`, "money"],
  "microloan:family": (s, d) => [`You borrow ${amount(s, d, "amt")} from a microfinance group.`, "money"],
  "cosign:sign": (s, d) => [`You co-sign an old friend's ${said(d, "what") || "loan"}: ${amount(s, d, "amt")}.`, "money"],
  "cosign:no": (_s, d) => `You won't co-sign an old friend's ${said(d, "what") || "loan"}. The friendship cools.`,
  "cosign:lend": () => ["You lend an old friend money yourself, instead of co-signing their loan.", "money"],
  "home_buy:no": (s, d) => `You pass on a flat for ${amount(s, d, "price")} and keep renting.`,
  "downsize:room": () => ["You rent out a spare room.", "money"],
  "disaster:fix": (_s, d) => [`${d.title}: you rebuild properly.`, "money"],
  "crypto_custody:exchange": () => "You leave your coins on the exchange.",
  "crypto_discovery:no": (_s, d) => `You hear about Bitcoin${grab(d, /at about (\$[\d.,]*\d)/) ? `, at about ${grab(d, /at about (\$[\d.,]*\d)/)},` : ""} and ignore it.`,
  "crypto_later:no": (_s, d) => `Bitcoin is at ${grab(d, /Bitcoin is at (\$[\d.,]*\d[KM]?)/) || "a new high"}. You pass.`,
  "stock_tip:pass": (_s, d) => {
    const st = d.payload?.st as { name?: string } | undefined;
    return st?.name ? `You pass on a hot tip: ${st.name}.` : null;
  },
  "angel:no": (_s, d) => {
    const st = d.payload?.st as { name?: string } | undefined;
    return st?.name ? `You pass on investing in ${st.name}, a friend's startup.` : null;
  },
  "ponzi:no": () => "You walk away from a 'guaranteed' 5% a month.",
  "bubble:steady": (_s, d) => (d.payload?.asset === "crypto" ? "Crypto mania all around. You stay the course." : "Everyone is getting rich on shares. You stay the course."),
  "fitness:gym": () => ["You join a gym.", "money"],
  "fitness:run": () => "You start running in the park.",
  "fitness:trainer": () => ["You hire a personal trainer for a year.", "money"],
  "checkup:full": () => ["You get a full health check.", "money"],
  "checkup:basic": () => "You get a basic health check.",
  "quit_smoking:keep": () => ["Your doctor frowns. You keep smoking.", "bad"],
  "charity:small": (_s, _d, label) => [`You give ${label.replace(/^Give /, "")} to research into the illness that took a friend.`, "money"],
  "charity:big": (_s, _d, label) => [`You give ${label.replace(/^Give /, "")} to research into the illness that took a friend.`, "money"],
  "charity:time": () => "You give your time to research into the illness that took a friend.",
  "romance_scam:block": () => "Someone you've been writing to online asks for money. You block them.",

  // moving
  "migration:stay": (_s, d) => `You turn down a job in ${countryName(said(d, "dest"))}.`,
  "migration:never": (s) => `You decide to stay in ${countryIn(s.country)} for good.`,
  "homesick:stay": (s) => `You put down roots in ${countryIn(s.country)}.`,

  // looking back
  "reflect30:security": () => "At thirty, money means security to you.",
  "reflect30:freedom": () => "At thirty, money means freedom to you.",
  "reflect30:status": () => "At thirty, money means status to you.",
  "reflect30:family": () => "At thirty, money means family to you.",
  "reflect30:impact": () => "At thirty, money means changing something.",
  "reflect50:less": () => "At fifty, you wish you'd taken fewer risks.",
  "reflect50:more": () => "At fifty, you wish you'd taken more risks.",
  "reflect50:same": () => "At fifty, you'd do it all the same.",
  "reflect50:time": () => "At fifty, you'd trade money for time.",
  "reflect70:heirs": () => "At seventy, you plan to leave it all to your children.",
  "reflect70:charity": () => "At seventy, you decide to give a big part away.",
  "reflect70:spend": () => "At seventy, you decide to spend it. You earned it.",
  "reflect70:keep": () => "At seventy, you keep it, just in case.",
};

/** The ledger line for a choice its event didn't write up, if it's worth one. */
export function choiceLine(s: LifeState, d: Decision, option: string): [string, Tone] | null {
  const label = d.options.find((o) => o.id === option)?.label ?? "";
  const line = LINES[`${d.event}:${option}`]?.(s, d, label);
  if (!line) return null;
  return typeof line === "string" ? [line, "neutral"] : line;
}

/** Every event and option the table writes for, to check against the deck. */
export const CHOICE_KEYS = Object.keys(LINES);
