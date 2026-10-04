import { resolveText, type ID, type Locale, type LocalizedText } from '@/data/types';
import type { QuizQuestion } from './types';

/* ------------------------------------------------------------------
   SchoolMind's own question bank.

   Insurance for the one moment that matters: if Gemini is out of
   quota while somebody is watching, Quiz still runs a real learning
   loop instead of showing an error. These questions are written here,
   in both languages, and the interface says so — they are never
   presented as AI-generated.

   Four per subject is enough to demonstrate the loop at the 5-question
   length without pretending to be a curriculum.
   ------------------------------------------------------------------ */

interface BankSeed {
  type: 'multiple' | 'boolean' | 'short';
  prompt: LocalizedText;
  /** Choice questions: the first option is the correct one; they are
   *  shuffled per session so the answer is never "always A". */
  options?: LocalizedText[];
  answer?: LocalizedText;
  explanation: LocalizedText;
  hint: LocalizedText;
}

const BANK: Record<ID, BankSeed[]> = {
  math: [
    {
      type: 'multiple',
      prompt: {
        uz: 'x² − 5x + 6 = 0 tenglamaning ildizlari qaysilar?',
        ru: 'Каковы корни уравнения x² − 5x + 6 = 0?',
      },
      options: [
        { uz: 'x = 2 va x = 3', ru: 'x = 2 и x = 3' },
        { uz: 'x = −2 va x = −3', ru: 'x = −2 и x = −3' },
        { uz: 'x = 1 va x = 6', ru: 'x = 1 и x = 6' },
        { uz: 'x = 0 va x = 5', ru: 'x = 0 и x = 5' },
      ],
      explanation: {
        uz: 'D = 25 − 24 = 1, shuning uchun x = (5 ± 1)/2, yaʼni 3 va 2.',
        ru: 'D = 25 − 24 = 1, значит x = (5 ± 1)/2, то есть 3 и 2.',
      },
      hint: {
        uz: 'Yigʻindisi 5, koʻpaytmasi 6 boʻlgan ikki son qaysi?',
        ru: 'Какие два числа дают в сумме 5, а в произведении 6?',
      },
    },
    {
      type: 'short',
      prompt: {
        uz: '3x + 7 = 22 boʻlsa, x nechaga teng?',
        ru: 'Чему равен x, если 3x + 7 = 22?',
      },
      answer: { uz: '5', ru: '5' },
      explanation: {
        uz: '3x = 22 − 7 = 15, demak x = 15 / 3 = 5.',
        ru: '3x = 22 − 7 = 15, значит x = 15 / 3 = 5.',
      },
      hint: {
        uz: 'Avval 7 ni oʻng tomonga oʻtkazing.',
        ru: 'Сначала перенесите 7 в правую часть.',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: 'Diskriminant manfiy boʻlsa, kvadrat tenglamaning haqiqiy ildizi boʻlmaydi.',
        ru: 'Если дискриминант отрицательный, у квадратного уравнения нет действительных корней.',
      },
      explanation: {
        uz: 'Haʼ. D < 0 boʻlganda √D haqiqiy son emas, shuning uchun haqiqiy ildiz yoʻq.',
        ru: 'Да. При D < 0 корень из D не является действительным числом, поэтому корней нет.',
      },
      hint: {
        uz: 'Manfiy sondan kvadrat ildiz chiqarib boʻladimi?',
        ru: 'Можно ли извлечь квадратный корень из отрицательного числа?',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: '(x + 4)(x − 4) ifodaning qisqartirilgan koʻrinishi qaysi?',
        ru: 'Какой свёрнутый вид у выражения (x + 4)(x − 4)?',
      },
      options: [
        { uz: 'x² − 16', ru: 'x² − 16' },
        { uz: 'x² + 16', ru: 'x² + 16' },
        { uz: 'x² − 8x + 16', ru: 'x² − 8x + 16' },
        { uz: 'x² + 8x − 16', ru: 'x² + 8x − 16' },
      ],
      explanation: {
        uz: 'Bu kvadratlar ayirmasi: (a + b)(a − b) = a² − b², yaʼni x² − 16.',
        ru: 'Это разность квадратов: (a + b)(a − b) = a² − b², то есть x² − 16.',
      },
      hint: {
        uz: 'Oʻrtadagi hadlar bir-birini yoʻqotadi.',
        ru: 'Средние слагаемые взаимно уничтожаются.',
      },
    },
  ],

  physics: [
    {
      type: 'multiple',
      prompt: {
        uz: 'Nyutonning ikkinchi qonuni qaysi formula bilan ifodalanadi?',
        ru: 'Какой формулой выражается второй закон Ньютона?',
      },
      options: [
        { uz: 'F = m · a', ru: 'F = m · a' },
        { uz: 'F = m / a', ru: 'F = m / a' },
        { uz: 'F = a / m', ru: 'F = a / m' },
        { uz: 'F = m · v', ru: 'F = m · v' },
      ],
      explanation: {
        uz: 'Kuch massa bilan tezlanishning koʻpaytmasiga teng: F = m · a.',
        ru: 'Сила равна произведению массы на ускорение: F = m · a.',
      },
      hint: {
        uz: 'Bir xil kuchda ogʻirroq jism sekinroq tezlanadi.',
        ru: 'При одной силе более тяжёлое тело разгоняется медленнее.',
      },
    },
    {
      type: 'short',
      prompt: {
        uz: 'Tezlanishning oʻlchov birligi qanday (SI tizimida)?',
        ru: 'Какова единица измерения ускорения в СИ?',
      },
      answer: { uz: 'm/s²', ru: 'м/с²' },
      explanation: {
        uz: 'Tezlanish — tezlikning vaqtga nisbati, yaʼni (m/s) / s = m/s².',
        ru: 'Ускорение — отношение скорости ко времени: (м/с) / с = м/с².',
      },
      hint: {
        uz: 'Tezlikni yana bir marta vaqtga boʻling.',
        ru: 'Разделите скорость ещё раз на время.',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: 'Jismga taʼsir etuvchi kuchlar yigʻindisi nolga teng boʻlsa, jism tinch yoki tekis harakatda boʻladi.',
        ru: 'Если сумма сил равна нулю, тело покоится или движется равномерно.',
      },
      explanation: {
        uz: 'Haʼ, bu Nyutonning birinchi qonuni — inersiya qonuni.',
        ru: 'Да, это первый закон Ньютона — закон инерции.',
      },
      hint: {
        uz: 'Birinchi qonunni eslang.',
        ru: 'Вспомните первый закон.',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: '72 km/soat tezlik necha m/s ga teng?',
        ru: 'Чему равна скорость 72 км/ч в м/с?',
      },
      options: [
        { uz: '20 m/s', ru: '20 м/с' },
        { uz: '7,2 m/s', ru: '7,2 м/с' },
        { uz: '72 m/s', ru: '72 м/с' },
        { uz: '36 m/s', ru: '36 м/с' },
      ],
      explanation: {
        uz: 'km/soatni 3,6 ga boʻlamiz: 72 / 3,6 = 20 m/s.',
        ru: 'Делим км/ч на 3,6: 72 / 3,6 = 20 м/с.',
      },
      hint: {
        uz: '1 m/s = 3,6 km/soat.',
        ru: '1 м/с = 3,6 км/ч.',
      },
    },
  ],

  chemistry: [
    {
      type: 'short',
      prompt: {
        uz: 'Suv molekulasining kimyoviy formulasi qanday?',
        ru: 'Какова химическая формула молекулы воды?',
      },
      answer: { uz: 'H2O', ru: 'H2O' },
      explanation: {
        uz: 'Ikki vodorod atomi va bitta kislorod atomi: H₂O.',
        ru: 'Два атома водорода и один атом кислорода: H₂O.',
      },
      hint: {
        uz: 'Ikki vodorod, bir kislorod.',
        ru: 'Два водорода, один кислород.',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: 'H₂ + O₂ → H₂O reaksiyasi tenglashtirilganda qanday koʻrinish oladi?',
        ru: 'Как выглядит уравненная реакция H₂ + O₂ → H₂O?',
      },
      options: [
        { uz: '2H₂ + O₂ → 2H₂O', ru: '2H₂ + O₂ → 2H₂O' },
        { uz: 'H₂ + O₂ → H₂O', ru: 'H₂ + O₂ → H₂O' },
        { uz: 'H₂ + 2O₂ → H₂O', ru: 'H₂ + 2O₂ → H₂O' },
        { uz: '2H₂ + 2O₂ → 2H₂O', ru: '2H₂ + 2O₂ → 2H₂O' },
      ],
      explanation: {
        uz: 'Har ikki tomonda 4 ta vodorod va 2 ta kislorod atomi boʻlishi kerak.',
        ru: 'С обеих сторон должно быть 4 атома водорода и 2 атома кислорода.',
      },
      hint: {
        uz: 'Avval kislorod atomlarini sanang.',
        ru: 'Сначала посчитайте атомы кислорода.',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: 'Atomdagi protonlar soni element tartib raqamiga teng.',
        ru: 'Число протонов в атоме равно порядковому номеру элемента.',
      },
      explanation: {
        uz: 'Haʼ, tartib raqami aynan protonlar sonini bildiradi.',
        ru: 'Да, порядковый номер — это именно число протонов.',
      },
      hint: {
        uz: 'Davriy jadvaldagi raqam nimani bildiradi?',
        ru: 'Что обозначает номер в таблице Менделеева?',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: 'CaO qanday oksidga kiradi?',
        ru: 'К какому типу оксидов относится CaO?',
      },
      options: [
        { uz: 'Asosli oksid', ru: 'Основный оксид' },
        { uz: 'Kislotali oksid', ru: 'Кислотный оксид' },
        { uz: 'Amfoter oksid', ru: 'Амфотерный оксид' },
        { uz: 'Befarq oksid', ru: 'Несолеобразующий оксид' },
      ],
      explanation: {
        uz: 'Kalsiy — metall, shuning uchun CaO asosli oksid va suv bilan asos hosil qiladi.',
        ru: 'Кальций — металл, поэтому CaO основный оксид и с водой даёт основание.',
      },
      hint: {
        uz: 'Kalsiy metallmi yoki metallmasmi?',
        ru: 'Кальций — металл или неметалл?',
      },
    },
  ],

  biology: [
    {
      type: 'multiple',
      prompt: {
        uz: 'Fotosintez jarayoni asosan hujayraning qaysi qismida boradi?',
        ru: 'В какой части клетки в основном идёт фотосинтез?',
      },
      options: [
        { uz: 'Xloroplastda', ru: 'В хлоропласте' },
        { uz: 'Mitoxondriyada', ru: 'В митохондрии' },
        { uz: 'Yadroda', ru: 'В ядре' },
        { uz: 'Ribosomada', ru: 'В рибосоме' },
      ],
      explanation: {
        uz: 'Xloroplastdagi xlorofill yorugʻlikni yutadi va fotosintezni taʼminlaydi.',
        ru: 'Хлорофилл в хлоропласте поглощает свет и обеспечивает фотосинтез.',
      },
      hint: {
        uz: 'Yashil rang qaysi organoiddan keladi?',
        ru: 'Какой органоид придаёт зелёный цвет?',
      },
    },
    {
      type: 'short',
      prompt: {
        uz: 'Fotosintez natijasida havoga qaysi gaz ajralib chiqadi?',
        ru: 'Какой газ выделяется в воздух при фотосинтезе?',
      },
      answer: { uz: 'kislorod', ru: 'кислород' },
      explanation: {
        uz: 'Oʻsimlik karbonat angidridni yutadi va kislorod ajratadi.',
        ru: 'Растение поглощает углекислый газ и выделяет кислород.',
      },
      hint: {
        uz: 'Biz nafas oladigan gaz.',
        ru: 'Газ, которым мы дышим.',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: 'Hujayra devori hayvon hujayralarida ham mavjud.',
        ru: 'Клеточная стенка есть и у животных клеток.',
      },
      options: [
        { uz: 'Notoʻgʻri', ru: 'Неверно' },
        { uz: 'Toʻgʻri', ru: 'Верно' },
      ],
      explanation: {
        uz: 'Yoʻq. Hujayra devori oʻsimlik, zamburugʻ va bakteriyalarda boʻladi, hayvonlarda esa faqat membrana.',
        ru: 'Нет. Клеточная стенка есть у растений, грибов и бактерий, у животных только мембрана.',
      },
      hint: {
        uz: 'Hayvon hujayrasi shaklini nima ushlab turadi?',
        ru: 'Что удерживает форму животной клетки?',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: 'Qon aylanishning kichik doirasi qayerga yoʻnaltirilgan?',
        ru: 'Куда направлен малый круг кровообращения?',
      },
      options: [
        { uz: 'Oʻpkaga', ru: 'К лёгким' },
        { uz: 'Jigarga', ru: 'К печени' },
        { uz: 'Buyrakka', ru: 'К почкам' },
        { uz: 'Miyaga', ru: 'К мозгу' },
      ],
      explanation: {
        uz: 'Kichik doira yurakdan oʻpkaga boradi va u yerda qon kislorodga toʻyinadi.',
        ru: 'Малый круг идёт от сердца к лёгким, где кровь насыщается кислородом.',
      },
      hint: {
        uz: 'Qon qayerda kislorod oladi?',
        ru: 'Где кровь получает кислород?',
      },
    },
  ],

  english: [
    {
      type: 'multiple',
      prompt: {
        uz: 'Choose the correct form: "She ___ in London since 2019."',
        ru: 'Choose the correct form: "She ___ in London since 2019."',
      },
      options: [
        { uz: 'has lived', ru: 'has lived' },
        { uz: 'lives', ru: 'lives' },
        { uz: 'lived', ru: 'lived' },
        { uz: 'is living', ru: 'is living' },
      ],
      explanation: {
        uz: '"Since" bilan Present Perfect ishlatiladi: has lived.',
        ru: 'Со словом "since" используется Present Perfect: has lived.',
      },
      hint: {
        uz: '"Since" soʻzi qaysi zamonni talab qiladi?',
        ru: 'Какого времени требует слово "since"?',
      },
    },
    {
      type: 'short',
      prompt: {
        uz: '"Give up" phrasal verb nimani anglatadi (bir soʻz bilan)?',
        ru: 'Что означает фразовый глагол "give up" (одним словом)?',
      },
      answer: { uz: 'tashlamoq', ru: 'бросить' },
      explanation: {
        uz: '"Give up" — biror ishni tashlamoq, voz kechmoq.',
        ru: '"Give up" — бросить, отказаться от чего-либо.',
      },
      hint: {
        uz: 'Chekishni "give up" qilish nimani bildiradi?',
        ru: 'Что значит "give up smoking"?',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: '"Information" soʻzi sanaladigan ot va "informations" shakli toʻgʻri.',
        ru: 'Слово "information" исчисляемое, и форма "informations" верна.',
      },
      options: [
        { uz: 'Notoʻgʻri', ru: 'Неверно' },
        { uz: 'Toʻgʻri', ru: 'Верно' },
      ],
      explanation: {
        uz: '"Information" sanalmaydigan ot, koʻplik shakli yoʻq.',
        ru: '"Information" — неисчисляемое существительное, множественного числа нет.',
      },
      hint: {
        uz: '"Much information" yoki "many informations"?',
        ru: '"Much information" или "many informations"?',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: 'Reported speech: He said, "I am tired." → He said that he ___ tired.',
        ru: 'Reported speech: He said, "I am tired." → He said that he ___ tired.',
      },
      options: [
        { uz: 'was', ru: 'was' },
        { uz: 'is', ru: 'is' },
        { uz: 'has been', ru: 'has been' },
        { uz: 'will be', ru: 'will be' },
      ],
      explanation: {
        uz: 'Koʻchirma gapda zamon bir pogʻona orqaga suriladi: am → was.',
        ru: 'В косвенной речи время сдвигается на шаг назад: am → was.',
      },
      hint: {
        uz: 'Zamon orqaga suriladi.',
        ru: 'Время сдвигается назад.',
      },
    },
  ],

  history: [
    {
      type: 'multiple',
      prompt: {
        uz: 'Amir Temur davlatining poytaxti qaysi shahar edi?',
        ru: 'Какой город был столицей государства Амира Темура?',
      },
      options: [
        { uz: 'Samarqand', ru: 'Самарканд' },
        { uz: 'Buxoro', ru: 'Бухара' },
        { uz: 'Xiva', ru: 'Хива' },
        { uz: 'Toshkent', ru: 'Ташкент' },
      ],
      explanation: {
        uz: 'Amir Temur Samarqandni poytaxt qilib, uni yirik ilmiy va meʼmoriy markazga aylantirgan.',
        ru: 'Амир Темур сделал Самарканд столицей и превратил его в крупный научный и архитектурный центр.',
      },
      hint: {
        uz: 'Registon maydoni qaysi shaharda?',
        ru: 'В каком городе площадь Регистан?',
      },
    },
    {
      type: 'short',
      prompt: {
        uz: 'Ulugʻbek rasadxonasi qaysi shaharda qurilgan?',
        ru: 'В каком городе построена обсерватория Улугбека?',
      },
      answer: { uz: 'Samarqand', ru: 'Самарканд' },
      explanation: {
        uz: 'Rasadxona XV asrda Samarqandda qurilgan va yulduzlar jadvali shu yerda tuzilgan.',
        ru: 'Обсерватория построена в XV веке в Самарканде, там же составлен звёздный каталог.',
      },
      hint: {
        uz: 'Temuriylar poytaxti.',
        ru: 'Столица Тимуридов.',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: 'Buyuk ipak yoʻli faqat ipak savdosi uchun ishlatilgan.',
        ru: 'Великий шёлковый путь использовался только для торговли шёлком.',
      },
      options: [
        { uz: 'Notoʻgʻri', ru: 'Неверно' },
        { uz: 'Toʻgʻri', ru: 'Верно' },
      ],
      explanation: {
        uz: 'Yoʻq. Ipakdan tashqari qogʻoz, ziravor, texnologiya va gʻoyalar ham tarqalgan.',
        ru: 'Нет. Кроме шёлка перемещались бумага, пряности, технологии и идеи.',
      },
      hint: {
        uz: 'Qogʻoz qanday tarqalgan?',
        ru: 'Как распространилась бумага?',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: 'Al-Xorazmiy nomi bilan bogʻliq atama qaysi?',
        ru: 'Какой термин связан с именем аль-Хорезми?',
      },
      options: [
        { uz: 'Algoritm', ru: 'Алгоритм' },
        { uz: 'Atom', ru: 'Атом' },
        { uz: 'Logarifm', ru: 'Логарифм' },
        { uz: 'Integral', ru: 'Интеграл' },
      ],
      explanation: {
        uz: '"Algoritm" soʻzi al-Xorazmiy ismining lotincha shaklidan kelib chiqqan.',
        ru: 'Слово «алгоритм» происходит от латинизированной формы имени аль-Хорезми.',
      },
      hint: {
        uz: 'Informatikada har kuni ishlatiladigan soʻz.',
        ru: 'Слово, которое каждый день используют в информатике.',
      },
    },
  ],

  native: [
    {
      type: 'multiple',
      prompt: {
        uz: '"Kitob" soʻzi qaysi soʻz turkumiga kiradi?',
        ru: 'К какой части речи относится слово «китоб» (книга)?',
      },
      options: [
        { uz: 'Ot', ru: 'Существительное' },
        { uz: 'Sifat', ru: 'Прилагательное' },
        { uz: 'Feʼl', ru: 'Глагол' },
        { uz: 'Ravish', ru: 'Наречие' },
      ],
      explanation: {
        uz: 'Predmetni bildirib, "nima?" soʻrogʻiga javob beradi — demak ot.',
        ru: 'Обозначает предмет и отвечает на вопрос «что?» — значит существительное.',
      },
      hint: {
        uz: 'Qaysi soʻroqqa javob beradi?',
        ru: 'На какой вопрос отвечает?',
      },
    },
    {
      type: 'short',
      prompt: {
        uz: 'Gapning bosh boʻlaklari nechta?',
        ru: 'Сколько главных членов в предложении?',
      },
      answer: { uz: '2', ru: '2' },
      explanation: {
        uz: 'Ega va kesim — gapning ikkita bosh boʻlagi.',
        ru: 'Подлежащее и сказуемое — два главных члена предложения.',
      },
      hint: {
        uz: 'Ega va kesim.',
        ru: 'Подлежащее и сказуемое.',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: 'Sifat predmetning belgisini bildiradi.',
        ru: 'Прилагательное обозначает признак предмета.',
      },
      explanation: {
        uz: 'Haʼ, sifat "qanday?" soʻrogʻiga javob berib, belgini bildiradi.',
        ru: 'Да, прилагательное отвечает на вопрос «какой?» и обозначает признак.',
      },
      hint: {
        uz: '"Qanday?" soʻrogʻini eslang.',
        ru: 'Вспомните вопрос «какой?».',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: 'Insho yozishda birinchi qadam qaysi?',
        ru: 'Какой первый шаг при написании сочинения?',
      },
      options: [
        { uz: 'Reja tuzish', ru: 'Составить план' },
        { uz: 'Xulosani yozish', ru: 'Написать вывод' },
        { uz: 'Sarlavhani boʻyash', ru: 'Оформить заголовок' },
        { uz: 'Darhol oqqa koʻchirish', ru: 'Сразу писать начисто' },
      ],
      explanation: {
        uz: 'Reja matn tuzilishini belgilaydi va fikrni tartibga soladi.',
        ru: 'План задаёт структуру текста и упорядочивает мысли.',
      },
      hint: {
        uz: 'Yozishdan oldin nima qilinadi?',
        ru: 'Что делают до начала письма?',
      },
    },
  ],

  it: [
    {
      type: 'multiple',
      prompt: {
        uz: 'Blok-sxemada romb shakli nimani bildiradi?',
        ru: 'Что обозначает ромб в блок-схеме?',
      },
      options: [
        { uz: 'Shart tekshirish', ru: 'Проверку условия' },
        { uz: 'Boshlanish', ru: 'Начало' },
        { uz: 'Amal bajarish', ru: 'Выполнение действия' },
        { uz: 'Maʼlumot kiritish', ru: 'Ввод данных' },
      ],
      explanation: {
        uz: 'Romb shartni bildiradi: javobga qarab oqim ikki yoʻlga ajraladi.',
        ru: 'Ромб обозначает условие: поток разветвляется в зависимости от ответа.',
      },
      hint: {
        uz: 'Undan ikkita chiziq chiqadi.',
        ru: 'Из него выходят две линии.',
      },
    },
    {
      type: 'short',
      prompt: {
        uz: 'Massivning birinchi elementi indeksi odatda nechaga teng?',
        ru: 'Какой индекс обычно у первого элемента массива?',
      },
      answer: { uz: '0', ru: '0' },
      explanation: {
        uz: 'Koʻpchilik dasturlash tillarida indekslash 0 dan boshlanadi.',
        ru: 'В большинстве языков программирования индексация начинается с 0.',
      },
      hint: {
        uz: 'Birdan emas.',
        ru: 'Не с единицы.',
      },
    },
    {
      type: 'boolean',
      prompt: {
        uz: 'Algoritm cheksiz davom etishi mumkin va bu normal holat.',
        ru: 'Алгоритм может выполняться бесконечно, и это нормально.',
      },
      options: [
        { uz: 'Notoʻgʻri', ru: 'Неверно' },
        { uz: 'Toʻgʻri', ru: 'Верно' },
      ],
      explanation: {
        uz: 'Yoʻq. Algoritmning asosiy xossalaridan biri — chekliligi, yaʼni u tugashi kerak.',
        ru: 'Нет. Одно из основных свойств алгоритма — конечность: он должен завершаться.',
      },
      hint: {
        uz: 'Algoritm xossalarini eslang.',
        ru: 'Вспомните свойства алгоритма.',
      },
    },
    {
      type: 'multiple',
      prompt: {
        uz: 'Shartli operator qaysi holatda ishlatiladi?',
        ru: 'В каком случае используется условный оператор?',
      },
      options: [
        { uz: 'Tanlov qilish kerak boʻlganda', ru: 'Когда нужно сделать выбор' },
        { uz: 'Faqat chiqarish uchun', ru: 'Только для вывода' },
        { uz: 'Oʻzgaruvchi eʼlon qilishda', ru: 'При объявлении переменной' },
        { uz: 'Dasturni tugatishda', ru: 'При завершении программы' },
      ],
      explanation: {
        uz: 'Shartli operator shart bajarilgan-bajarilmaganiga qarab turli amallarni bajaradi.',
        ru: 'Условный оператор выполняет разные действия в зависимости от истинности условия.',
      },
      hint: {
        uz: '"Agar ... boʻlsa" degan jumlani oʻylang.',
        ru: 'Подумайте о фразе «если ... то».',
      },
    },
  ],
};

/** Default true/false wording, when a seed does not give its own. */
const YES_NO: LocalizedText[] = [
  { uz: 'Toʻgʻri', ru: 'Верно' },
  { uz: 'Notoʻgʻri', ru: 'Неверно' },
];

/** Deterministic shuffle, seeded, so a session is stable across a
 *  re-render but the right answer is not always first. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function bankHasSubject(subjectId: ID): boolean {
  return (BANK[subjectId]?.length ?? 0) > 0;
}

/**
 * Questions SchoolMind can always ask. `count` is a maximum: the bank
 * is small on purpose, and a short honest quiz beats a padded one.
 */
export function bankQuestions(subjectId: ID, locale: Locale, count: number): QuizQuestion[] {
  const seeds = BANK[subjectId] ?? [];
  const seed = Date.now() % 100000;

  return shuffled(seeds, seed)
    .slice(0, count)
    .map((entry, index) => {
      const optionTexts =
        entry.type === 'short' ? [] : (entry.options ?? YES_NO).map((o) => resolveText(o, locale));

      /* The correct one is authored first; shuffle so it moves. */
      const options = shuffled(
        optionTexts.map((text, i) => ({ id: `o${i}`, text })),
        seed + index * 7 + 1,
      );

      return {
        id: `bank-${subjectId}-${index}`,
        type: entry.type,
        prompt: resolveText(entry.prompt, locale),
        options,
        correctOptionId: entry.type === 'short' ? '' : 'o0',
        correctAnswer:
          entry.type === 'short'
            ? resolveText(entry.answer ?? { uz: '', ru: '' }, locale)
            : optionTexts[0],
        explanation: resolveText(entry.explanation, locale),
        hint: resolveText(entry.hint, locale),
      };
    });
}
