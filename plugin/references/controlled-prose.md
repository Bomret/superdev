<!-- Sources, attribution, and licence terms: see NOTICE. -->

# Controlled prose

The writing standard for documentation. A repo selects it in the `## Writing standard` section of
`docs/agents/documentation.md` (ADR 0012). The `doc-writer` agent applies it. The `doc-reader` agent
verifies it.

The standard is **language-neutral**. Independent catalogues reach the same core rules from different
languages, and that convergence is what makes the rules portable. Every rule below holds in any language
you write documentation in. Rules that depend on one language live in *Declare per language* near the
end, and each repo answers those for itself.

The examples are written in English because this file is. They illustrate a rule, they do not restrict
it. Where an example names an English word pair ("use" over "utilize"), the rule is the principle behind
the pair: prefer the shorter and more common word.

## Scope

Apply the standard to **prose**: `AGENTS.md` files, `README.md`, ADR text, glossary entries,
knowledge-base pages, and report text.

Do not apply it to:

- Code, identifiers, command syntax, file paths, and configuration keys.
- Text inside fenced code blocks and inline code spans.
- Quoted output, quoted error strings, and text quoted from another source.
- **Voiced prose.** A hero paragraph, a pitch, or an essay needs a voice. This standard removes voice
  on purpose, so it does not govern that text. Convert the reference material around it instead.

Apply the standard only to text you write or change. Do not rewrite untouched prose to make it conform.
That is a separate task, and the user asks for it explicitly.

## Modes

**Strict.** Procedural and safety text: step lists, runbooks, setup procedures, warnings, and error
messages. Apply every rule and the 20-word limit.

**Relaxed.** Descriptive prose: `AGENTS.md` files, `README.md`, ADR narrative, and knowledge-base pages.
Apply every rule and the 25-word limit.

The modes differ in the sentence limit and in the use of the imperative. They do not differ in any
other rule.

## Words

- Use one name for one thing. Two names for one item make the reader ask what changed.
- Give each word one meaning. Use each word as one part of speech.
- When two words have the same meaning, use the shorter and more common one. Write "use", not
  "utilize". Write "start", not "commence" or "initiate". Write "help", not "facilitate". Write "make
  sure", not "ensure". Write "before", not "prior to". Write "about", not "regarding". Write "show", not
  "demonstrate". Write "also", not "additionally" or "furthermore".
- Remove words that add nothing. "It is important to note that the parser reads the file" says what
  "the parser reads the file" says.
- Do not hedge. Remove "somewhat", "fairly", "arguably", "it seems that", and "may possibly". State what
  is true, or state that you do not know.
- Do not evaluate. Remove "seamless", "robust", "powerful", "cutting-edge", "effortless", "world-class",
  "next-generation", and "revolutionary". Describe what the thing does instead.
- Do not count a set the repository can grow or shrink. Name the set, or name its members. A numeral
  stays where the number is the fact itself: a cap, a limit, a threshold, or a contract of fixed arity.
  Write "the hooks in `hooks/`", not "the eight shipped hooks". Keep "the two halves of the contract",
  where two is what the contract says.
- Do not use stock phrases. Remove "at the end of the day", "when it comes to", and "in order to".
- Do not use regional words, slang, or jargon as a technical term.
- Write a technical term of more than three words in full one time. Then give a shorter form, or join
  the words that operate as one unit.
- Spell out an abbreviation the first time you use it, unless the abbreviation is more common than the
  full form (for example, `HTTP`). Declare which abbreviations a repo uses without expansion.
- Do not use an abbreviation from another language when your own language has a word. Write "for
  example", not "e.g.". Write "that is", not "i.e.". Write the rest of the list, or end it, instead of
  "etc.".

## Verbs

- Use the active voice. Write "the parser reads the file", not "the file is read by the parser". Use
  the passive voice only when the actor is genuinely unknown.
- Use a verb for an action. Write "analyze the log", not "perform an analysis of the log". A verb turned
  into a noun hides who does what.
- Use the simple present tense for what the system does. Use the imperative for an instruction.
- Do not stack auxiliary verbs. Write "this improves throughput", not "this may help to improve
  throughput".
- Avoid modal verbs where a fact will do. "The hook blocks the merge" is a fact. "The hook should block
  the merge" is a wish, and the reader cannot tell which you meant.
- Do not use the hypothetical mood (the subjunctive, the conditional) for real behaviour.
- Do not use a verb plus a particle whose meaning is not the sum of its parts. Write "start the server",
  not "spin up the server". Write "extinguish the fire", not "put out the fire".
- Keep the parts of a verb together. A reader who meets the first half of a verb and finds the second
  half fifteen words later has to hold the sentence open.
- Keep one voice in one sentence. Do not open a sentence in the active voice and finish it in the
  passive voice.

## Sentences

- Write one topic in each sentence.
- Do not exceed the mode's limit: 20 words in strict mode, 25 words in relaxed mode.
- Do not omit words to make a sentence shorter. Keep the function words your language uses (articles,
  particles, case markers). Omit a word only when exactly one reading remains.
- Do not use an informal short form where your language also has a full form and the short form is
  optional. Write "do not", not "don't". An elision or a fusion your language requires ("l'index", "du")
  is not optional, so it is not this kind of short form.
- Do not state a fact by negating a negation. Write "the change is necessary", not "the change is not
  unnecessary". A language that marks negation on more than one word in one clause ("no hay nada") is
  doing something different: that repeated marking is one negation, not two, so it is exempt.
- Do not interrupt a sentence with a parenthetical insertion. Write a second sentence.
- Do not interrupt a sentence with a list. End the sentence, then start the list.
- Give a pronoun exactly one possible referent. If two nouns come before it, repeat the noun instead.
- Attach a modifying phrase to the word it describes. A phrase at the start of a sentence describes
  the subject that follows it. Write "after you merge the branch, the hook removes the worktree", not
  "after merging the branch, the worktree is removed".
- Put the parts of a sentence in the order the reader needs them. State a condition before the action it
  governs.
- Use the same sentence pattern for the same kind of statement. A reader who recognises the pattern
  reads the meaning, not the grammar.

## Definitions

A glossary entry and a first-use definition are prose, so every rule above applies. More rules
apply to a definition:

- Name the category the term belongs to, then name what separates it from the rest of that category.
  A definition that opens with a bare time or place ("a merge is when the hook runs") leaves the
  category out.
- Do not restate the term inside its own definition. "A run lock is a lock on a run" defines nothing.
- Define a term by what it is. Name a contrast with another term only after the reader knows what
  this term is.

## Procedures (strict mode)

- Write one instruction in each sentence, unless two actions happen at the same time.
- Write instructions in the imperative.
- When the reader must know a condition first, write the condition first. Then separate it from the
  command with a comma.
- Write a note to give information. A note does not contain an instruction.
- Give each numbered step one action, or a group of actions the reader performs as one. Two actions in
  two separate parts of an interface are two steps.
- State the result of a step where the reader needs it to continue. A step that opens something, writes
  something, or changes state says so.
- Do not number a result. A number tells the reader to perform the line. Write the result inside the
  step, or on its own line below it.
- Give sibling procedures one lead-in pattern. When one procedure opens with a phrase, the next
  procedure opens with the same phrase.

## Descriptive text (relaxed mode)

- Give information gradually. A reader who meets four new facts in one sentence reads it twice.
- Write one topic in each paragraph.
- Write no more than six sentences in a paragraph.
- Connect related sentences with a connecting word ("and", "but", "then", "thus", "as a result").
- Do not use the imperative in descriptive text.

## Safety and error text (strict mode)

- Name the level of risk with a consistent word. A warning names a risk to people. A caution names a
  risk to data or equipment.
- Start with the command or the condition.
- Explain the risk or the result the reader avoids.

## Headings, lists, tables, and references

- Do not write a full sentence as a heading. Do not write a subordinate clause in a heading.
- Give a heading one topic. Put the word that distinguishes it first.
- Do not repeat the parent heading's words in a child heading.
- Use the same grammatical form for headings at the same level.
- Do not state a fact in a heading and leave it out of the text. The text below a heading reads
  complete when the reader skips the heading.
- Introduce a list with a sentence that ends in a colon.
- Close a list. The sentence after the list refers back to the list, or to the sentence that
  introduced it.
- Put only items of the same kind in one list.
- Where your script has letter case, start each list item the way it starts a sentence (*Declare per
  language*, **Case and possessive forms**). End an item with a period only when the item is a full
  sentence. Always end the last item with a period. Do not end an item with a comma.
- Give a table column a heading that names what the column holds. Use a noun.
- Do not build a table's structure from one language's sentence order. A pair of headings that reads as
  the halves of one sentence (`If …` and `then …`) is the common form of this error. Word order differs
  between languages, so that table stops parsing as soon as the text moves to another one.
- Make every cross-reference explicit. Name what the reader will find at the target. "See the section
  above" tells the reader nothing.
- Write a cross-reference so it survives the medium. A reference to a page number breaks on the web.

## Punctuation

- Do not use a semicolon. Write two sentences.
- Do not use a dash as punctuation. A dash marks a thought the writer did not finish separating. Use a
  period, a comma, a colon, or parentheses.
- Do not use an exclamation mark.
- Use parentheses for a reference, an identifier, an abbreviation, an alternative, or a short
  explanation.
- Where your script has letter case, do not put a word in capital letters for emphasis (*Declare per
  language*, **Case and possessive forms**).
- Do not use a character in place of a word. Write "and", not "&". Write "per", not "/".
- Do not use a mathematical symbol in running prose.

## How to count words

The sentence limits above need one counting rule, so that two readers reach the same number:

- A colon that introduces a list ends the sentence, exactly as a period does.
- Text inside parentheses counts as one word.
- Each of these counts as one word: a number, a number with its unit, an abbreviation, an alphanumeric
  identifier, quoted text, a heading or label, and a proper noun.
- A word joined by a hyphen counts as one word.

Word counts follow the conventions of the language you write in. A language that compounds heavily
packs more meaning into each word, so the same limit is stricter there. That is intended.

## Declare per language

These rules cannot be neutral. Each repo answers them once, in its own
`docs/agents/documentation.md`, and then applies the answer everywhere:

- **Spelling convention.** Which standard the repo writes to (for example, American or British English).
- **Compound formation.** When words join directly, when they take a separator, and when they stay
  apart.
- **Case and possessive forms.** Which form to use where the language offers more than one, including
  whether and how its script marks letter case.
- **Number and date format.** How numerals, decimals, and dates are written.
- **Quotation marks.** Which characters the repo uses, and which it uses for quoted interface text.
- **Terms left in another language.** Which technical terms stay untranslated.

Unanswered, each of these defaults to whatever the writer of the moment prefers. That is the
inconsistency this standard exists to remove, so answer them before the second writer arrives.

## Self-check

Every rule above is written as a check. Read the text you produced against each section before you
return it, and cite the section a violation belongs to. The `doc-reader` agent reads the same sections.

Those rules are checkable. Good documentation also needs judgment that no rule supplies: the right
technical term, the right amount of detail, and whether a sentence is true. This standard fixes the
form of the text. It cannot make an empty paragraph informative, and it cannot make a false statement
true.
