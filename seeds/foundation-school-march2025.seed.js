/**
 * ============================================
 * FILE: foundation-school-march2025.seed.js
 * PATH: cybev-backend-main/seeds/foundation-school-march2025.seed.js
 * VERSION: 2.0.0 - Complete March 2025 Manual
 * STATUS: NEW FILE - Copy to seeds/
 * ============================================
 * 
 * RUN: node seeds/foundation-school-march2025.seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cybev';

// Foundation Module Schema (inline for standalone execution)
const foundationModuleSchema = new mongoose.Schema({
  moduleNumber: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  subtitle: String,
  description: String,
  icon: String,
  color: String,
  duration: String,
  totalLessons: { type: Number, default: 0 },
  lessons: [{
    lessonNumber: Number,
    title: String,
    content: String,
    scriptureReferences: [String],
    keyPoints: [String],
    memoryVerse: String,
    duration: String
  }],
  quiz: [{
    question: String,
    options: [String],
    correctAnswer: Number,
    explanation: String
  }],
  assignment: {
    title: String,
    description: String,
    type: { type: String, enum: ['written', 'practical', 'reflection'] },
    dueInDays: Number
  },
  passingScore: { type: Number, default: 70 },
  isActive: { type: Boolean, default: true },
  order: Number
}, { timestamps: true });

const FoundationModule = mongoose.models.FoundationModule || mongoose.model('FoundationModule', foundationModuleSchema);

// Complete March 2025 Foundation School Curriculum
const modules = [
  // ==========================================
  // CLASS 1: THE NEW CREATURE
  // ==========================================
  {
    moduleNumber: 1,
    title: "The New Creature",
    subtitle: "Understanding Your New Identity in Christ",
    description: "Discover what it means to be born again and your new identity as a child of God. Learn about the spiritual transformation that takes place when you accept Jesus Christ.",
    icon: "Sparkles",
    color: "#10B981",
    duration: "2-3 hours",
    totalLessons: 5,
    lessons: [
      {
        lessonNumber: 1,
        title: "What Happened When You Were Born Again",
        content: `When you received Jesus Christ as your Lord and Savior, something extraordinary happened to you. You experienced the new birth - you became a new creature entirely!

2 Corinthians 5:17 says: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new."

This is not a reformation or improvement of the old you - it's a completely new creation. Your spirit was recreated. You received the very life and nature of God. The old sinful nature that was inherited from Adam was replaced with the nature of God.

This new birth is a spiritual birth. Jesus explained to Nicodemus in John 3:5-6: "Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God. That which is born of the flesh is flesh; and that which is born of the Spirit is spirit."

You have been translated from the kingdom of darkness into the Kingdom of God's dear Son (Colossians 1:13). You are now a citizen of heaven, seated with Christ in heavenly places.`,
        scriptureReferences: ["2 Corinthians 5:17", "John 3:3-6", "Colossians 1:13", "Ephesians 2:6"],
        keyPoints: [
          "You are a completely new creation - not reformed, but recreated",
          "Your spirit has been born of God",
          "You have received the divine nature",
          "You have been translated into God's Kingdom"
        ],
        memoryVerse: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new. - 2 Corinthians 5:17",
        duration: "30 minutes"
      },
      {
        lessonNumber: 2,
        title: "Your New Nature",
        content: `As a new creature in Christ, you have received a brand new nature - the divine nature! 2 Peter 1:4 tells us that God has given us "exceeding great and precious promises: that by these ye might be partakers of the divine nature."

This means you now have God's own nature living inside you. You are no longer a sinner by nature - you are now righteous by nature. Romans 5:19 says: "For as by one man's disobedience many were made sinners, so by the obedience of one shall many be made righteous."

Notice it says you were "made righteous" - not that you're trying to become righteous. It's already done! You are the righteousness of God in Christ Jesus (2 Corinthians 5:21).

This new nature is characterized by:
- Love (1 John 4:8 - God is love, and His nature is now yours)
- Righteousness (Ephesians 4:24)
- Holiness (1 Peter 1:16)
- Power (2 Timothy 1:7)
- Victory (1 John 5:4)

You don't have to struggle to be good - goodness is now your nature!`,
        scriptureReferences: ["2 Peter 1:4", "Romans 5:19", "2 Corinthians 5:21", "Ephesians 4:24"],
        keyPoints: [
          "You have received God's divine nature",
          "You are righteous by nature, not by works",
          "God's love nature is now in you",
          "Victory is your nature in Christ"
        ],
        memoryVerse: "Whereby are given unto us exceeding great and precious promises: that by these ye might be partakers of the divine nature. - 2 Peter 1:4",
        duration: "30 minutes"
      },
      {
        lessonNumber: 3,
        title: "Your New Family",
        content: `When you were born again, you were born into a new family - the family of God! John 1:12-13 says: "But as many as received him, to them gave he power to become the sons of God, even to them that believe on his name: Which were born, not of blood, nor of the will of the flesh, nor of the will of man, but of God."

You are now a child of God - not a servant, not a stranger, but a son or daughter. Galatians 4:6-7 declares: "And because ye are sons, God hath sent forth the Spirit of his Son into your hearts, crying, Abba, Father. Wherefore thou art no more a servant, but a son; and if a son, then an heir of God through Christ."

As a member of God's family:
- God is your Father - you can call Him "Abba" (Daddy)
- Jesus is your elder brother (Romans 8:29)
- You have billions of brothers and sisters worldwide
- You are an heir of God and joint-heir with Christ (Romans 8:17)
- All that belongs to Christ belongs to you

You have also been placed into a local church family. The church is not a building - it's the body of believers. You need fellowship with other believers to grow and fulfill your purpose.`,
        scriptureReferences: ["John 1:12-13", "Galatians 4:6-7", "Romans 8:17", "Hebrews 10:25"],
        keyPoints: [
          "God is now your Father",
          "You are a child of God, not a servant",
          "You are an heir of God and joint-heir with Christ",
          "You need fellowship with other believers"
        ],
        memoryVerse: "Behold, what manner of love the Father hath bestowed upon us, that we should be called the sons of God. - 1 John 3:1",
        duration: "30 minutes"
      },
      {
        lessonNumber: 4,
        title: "Your New Name",
        content: `In the Bible, a name represents identity, nature, and destiny. When you were born again, you received new names that describe who you really are in Christ.

Here are some of your new names:

1. CHRISTIAN - "Christ-like one" or "Little Christ" (Acts 11:26). You bear Christ's name and His nature.

2. SAINT - One who is set apart, holy (Romans 1:7, Ephesians 1:1). You are not a sinner saved by grace - you are a saint!

3. BELOVED - Deeply loved by God (Colossians 3:12). God's love for you is unconditional and eternal.

4. OVERCOMER - One who conquers (1 John 5:4). Victory is your identity, not just an occasional experience.

5. MORE THAN A CONQUEROR - (Romans 8:37). You don't just win - you win overwhelmingly!

6. AMBASSADOR OF CHRIST - (2 Corinthians 5:20). You represent the Kingdom of Heaven on earth.

7. LIGHT OF THE WORLD - (Matthew 5:14). You illuminate darkness wherever you go.

8. SALT OF THE EARTH - (Matthew 5:13). You preserve and add flavor to the world.

These names are not what you're trying to become - they are what you already are!`,
        scriptureReferences: ["Acts 11:26", "Romans 1:7", "Romans 8:37", "2 Corinthians 5:20"],
        keyPoints: [
          "You are called a Christian - a 'little Christ'",
          "You are a saint, not a sinner",
          "You are more than a conqueror",
          "You are an ambassador of Christ"
        ],
        memoryVerse: "Nay, in all these things we are more than conquerors through him that loved us. - Romans 8:37",
        duration: "30 minutes"
      },
      {
        lessonNumber: 5,
        title: "Your New Life",
        content: `You now have a brand new life - the eternal life of God! This is not just endless existence - it's the very quality of life that God has.

John 17:3 defines eternal life: "And this is life eternal, that they might know thee the only true God, and Jesus Christ, whom thou hast sent."

1 John 5:11-12 says: "And this is the record, that God hath given to us eternal life, and this life is in his Son. He that hath the Son hath life."

This new life means:
- You have God's life in you right now - not when you die
- Death has no power over you (John 11:25-26)
- You can live above sickness, poverty, and failure
- You have the ability to live victoriously every day

How to live this new life:
1. Renew your mind with God's Word (Romans 12:2)
2. Walk in the Spirit (Galatians 5:16)
3. Live by faith, not by sight (2 Corinthians 5:7)
4. Confess who you are in Christ (Romans 10:10)
5. Fellowship with other believers (Hebrews 10:25)
6. Pray without ceasing (1 Thessalonians 5:17)
7. Study the Word daily (2 Timothy 2:15)`,
        scriptureReferences: ["John 17:3", "1 John 5:11-12", "Romans 12:2", "Galatians 5:16"],
        keyPoints: [
          "You have God's quality of life now",
          "Death has no power over you",
          "Live by faith, not by sight",
          "Renew your mind daily with God's Word"
        ],
        memoryVerse: "He that hath the Son hath life; and he that hath not the Son of God hath not life. - 1 John 5:12",
        duration: "30 minutes"
      }
    ],
    quiz: [
      {
        question: "What happened to you when you were born again according to 2 Corinthians 5:17?",
        options: [
          "You were reformed and improved",
          "You became a new creature entirely",
          "You joined a religion",
          "You became a church member"
        ],
        correctAnswer: 1,
        explanation: "2 Corinthians 5:17 says you became a 'new creature' - not reformed, but completely recreated in Christ."
      },
      {
        question: "What nature did you receive when you were born again?",
        options: [
          "An improved human nature",
          "An angelic nature",
          "The divine nature of God",
          "A sinful nature"
        ],
        correctAnswer: 2,
        explanation: "2 Peter 1:4 tells us we have become 'partakers of the divine nature' - God's own nature!"
      },
      {
        question: "According to Galatians 4:6-7, what is your relationship with God now?",
        options: [
          "Servant",
          "Slave",
          "Stranger",
          "Son/Daughter"
        ],
        correctAnswer: 3,
        explanation: "Galatians 4:6-7 says we are sons, not servants - we can call God 'Abba, Father.'"
      },
      {
        question: "According to Romans 8:37, what are you in Christ?",
        options: [
          "Just a survivor",
          "A conqueror",
          "More than a conqueror",
          "Someone trying to overcome"
        ],
        correctAnswer: 2,
        explanation: "Romans 8:37 declares we are 'more than conquerors through him that loved us.'"
      },
      {
        question: "When do you have eternal life according to 1 John 5:12?",
        options: [
          "When you die",
          "When you get to heaven",
          "Right now if you have the Son",
          "After you do enough good works"
        ],
        correctAnswer: 2,
        explanation: "1 John 5:12 says 'He that hath the Son hath life' - present tense, right now!"
      }
    ],
    assignment: {
      title: "My New Identity Declaration",
      description: "Write out 10 scriptures that describe who you are in Christ. Memorize at least 3 of them and practice declaring them over yourself daily for the next week.",
      type: "written",
      dueInDays: 7
    },
    passingScore: 70,
    isActive: true,
    order: 1
  },

  // ==========================================
  // CLASS 2: THE HOLY SPIRIT
  // ==========================================
  {
    moduleNumber: 2,
    title: "The Holy Spirit",
    subtitle: "Your Helper, Guide, and Empowerer",
    description: "Discover the Person of the Holy Spirit, His ministry in your life, and how to receive and walk in His power daily.",
    icon: "Flame",
    color: "#F59E0B",
    duration: "2-3 hours",
    totalLessons: 5,
    lessons: [
      {
        lessonNumber: 1,
        title: "Who Is The Holy Spirit?",
        content: `The Holy Spirit is not a force, influence, or power - He is a Person. He is the third Person of the Godhead: Father, Son, and Holy Spirit. He has a personality with intellect, emotions, and will.

The Holy Spirit thinks and knows (1 Corinthians 2:10-11). He feels grief (Ephesians 4:30). He makes decisions (Acts 16:6-7). You can lie to Him (Acts 5:3-4). You can insult Him (Hebrews 10:29).

Jesus called Him "another Comforter" in John 14:16 - "And I will pray the Father, and he shall give you another Comforter, that he may abide with you for ever."

The word "another" in Greek is "allos" meaning "another of the same kind." The Holy Spirit is just like Jesus! When Jesus was on earth, He was with the disciples. Now, the Holy Spirit is with us and IN us.

The Holy Spirit has many names that reveal His ministry:
- Comforter/Helper (John 14:16)
- Spirit of Truth (John 16:13)
- Spirit of God (Romans 8:9)
- Spirit of Christ (Romans 8:9)
- Spirit of Grace (Hebrews 10:29)
- Spirit of Glory (1 Peter 4:14)`,
        scriptureReferences: ["John 14:16-17", "John 16:13", "Acts 5:3-4", "Romans 8:9"],
        keyPoints: [
          "The Holy Spirit is a Person, not a force",
          "He is the third Person of the Trinity",
          "He is 'another Comforter' just like Jesus",
          "He has personality - intellect, emotions, and will"
        ],
        memoryVerse: "And I will pray the Father, and he shall give you another Comforter, that he may abide with you for ever. - John 14:16",
        duration: "30 minutes"
      },
      {
        lessonNumber: 2,
        title: "The Holy Spirit In You",
        content: `When you were born again, the Holy Spirit came to live inside you. Your body is now His temple!

1 Corinthians 6:19 says: "What? know ye not that your body is the temple of the Holy Ghost which is in you, which ye have of God, and ye are not your own?"

This is revolutionary! In the Old Testament, the Holy Spirit would come upon people for specific tasks, then leave. But now, He lives permanently inside every believer.

Romans 8:9 confirms: "But ye are not in the flesh, but in the Spirit, if so be that the Spirit of God dwell in you. Now if any man have not the Spirit of Christ, he is none of his."

What does His indwelling mean for you?
1. You are never alone - He is always with you
2. You have God's power available 24/7
3. He guides you from within
4. He teaches you all things
5. He helps your weaknesses
6. He intercedes for you in prayer

The Holy Spirit IN you is for your personal transformation and daily living. But there's more - the Holy Spirit UPON you is for power and service (Acts 1:8).`,
        scriptureReferences: ["1 Corinthians 6:19", "Romans 8:9", "John 14:17", "Romans 8:26"],
        keyPoints: [
          "Your body is the temple of the Holy Spirit",
          "He lives permanently inside you",
          "You are never alone",
          "He helps your weaknesses"
        ],
        memoryVerse: "Know ye not that ye are the temple of God, and that the Spirit of God dwelleth in you? - 1 Corinthians 3:16",
        duration: "30 minutes"
      },
      {
        lessonNumber: 3,
        title: "The Baptism of the Holy Spirit",
        content: `Beyond having the Holy Spirit dwell IN you at salvation, Jesus wants you to be BAPTIZED in the Holy Spirit. This is a separate experience that empowers you for service.

Jesus commanded in Acts 1:4-5: "And, being assembled together with them, commanded them that they should not depart from Jerusalem, but wait for the promise of the Father... ye shall be baptized with the Holy Ghost not many days hence."

In Acts 1:8, Jesus explained the purpose: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me."

The initial evidence of the baptism in the Holy Spirit is speaking in tongues. Acts 2:4 records: "And they were all filled with the Holy Ghost, and began to speak with other tongues, as the Spirit gave them utterance."

This pattern continued throughout Acts:
- Cornelius' household (Acts 10:44-46)
- Disciples at Ephesus (Acts 19:6)

How to receive:
1. Ask the Father (Luke 11:13)
2. Believe you receive (Mark 11:24)
3. Begin to speak as the Spirit gives utterance`,
        scriptureReferences: ["Acts 1:4-5", "Acts 1:8", "Acts 2:4", "Acts 10:44-46"],
        keyPoints: [
          "The baptism is separate from salvation",
          "It empowers you for service and witness",
          "The initial evidence is speaking in tongues",
          "Ask and receive by faith"
        ],
        memoryVerse: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me. - Acts 1:8",
        duration: "30 minutes"
      },
      {
        lessonNumber: 4,
        title: "Walking In The Spirit",
        content: `Being filled with the Spirit is not a one-time event - it's a continuous lifestyle. Ephesians 5:18 commands: "And be not drunk with wine, wherein is excess; but be filled with the Spirit."

The Greek tense here means "be being filled continually." It's an ongoing experience.

How to walk in the Spirit:

1. PRAY IN THE SPIRIT (Jude 1:20, 1 Corinthians 14:15)
Speaking in tongues builds you up spiritually and keeps you sensitive to the Spirit.

2. STUDY THE WORD (John 16:13)
The Spirit leads you through the Word. He will never contradict Scripture.

3. BE LED BY THE SPIRIT (Romans 8:14)
Learn to follow His inner witness - that peace or check in your spirit.

4. DON'T GRIEVE THE SPIRIT (Ephesians 4:30)
Avoid sin, unforgiveness, and negative speech that grieves Him.

5. DON'T QUENCH THE SPIRIT (1 Thessalonians 5:19)
Don't ignore His promptings or suppress His manifestations.

When you walk in the Spirit, you won't fulfill the lusts of the flesh (Galatians 5:16). The fruit of the Spirit - love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, self-control - will be evident in your life.`,
        scriptureReferences: ["Ephesians 5:18", "Galatians 5:16", "Romans 8:14", "Jude 1:20"],
        keyPoints: [
          "Be continuously filled with the Spirit",
          "Pray in tongues regularly",
          "Follow the Spirit's inner witness",
          "Don't grieve or quench the Spirit"
        ],
        memoryVerse: "This I say then, Walk in the Spirit, and ye shall not fulfil the lust of the flesh. - Galatians 5:16",
        duration: "30 minutes"
      },
      {
        lessonNumber: 5,
        title: "Gifts of the Spirit",
        content: `The Holy Spirit distributes spiritual gifts to every believer for ministry and service. 1 Corinthians 12:7 says: "But the manifestation of the Spirit is given to every man to profit withal."

The nine gifts of the Spirit (1 Corinthians 12:8-10):

REVELATION GIFTS (Know something):
1. Word of Wisdom - Supernatural wisdom for a specific situation
2. Word of Knowledge - Supernatural knowledge of facts
3. Discerning of Spirits - Ability to discern the spiritual realm

POWER GIFTS (Do something):
4. Gift of Faith - Supernatural faith for impossible situations
5. Working of Miracles - Supernatural intervention in natural laws
6. Gifts of Healing - Supernatural healing of diseases

VOCAL GIFTS (Say something):
7. Prophecy - Speaking God's message to people
8. Diverse Kinds of Tongues - Speaking in unknown languages
9. Interpretation of Tongues - Understanding tongues for the congregation

1 Corinthians 14:1 encourages us: "Follow after charity, and desire spiritual gifts."

You should earnestly desire and ask for spiritual gifts. They are tools for ministry - use them to bless others and glorify God!`,
        scriptureReferences: ["1 Corinthians 12:7-11", "1 Corinthians 14:1", "Romans 12:6-8", "Ephesians 4:11"],
        keyPoints: [
          "Every believer receives spiritual gifts",
          "Nine manifestation gifts of the Spirit",
          "Desire and earnestly seek spiritual gifts",
          "Gifts are for service, not status"
        ],
        memoryVerse: "But the manifestation of the Spirit is given to every man to profit withal. - 1 Corinthians 12:7",
        duration: "30 minutes"
      }
    ],
    quiz: [
      {
        question: "The Holy Spirit is best described as:",
        options: [
          "A force or power",
          "An influence from God",
          "A Person - the third Person of the Trinity",
          "A feeling you get"
        ],
        correctAnswer: 2,
        explanation: "The Holy Spirit is a Person with personality - intellect, emotions, and will. He is the third Person of the Godhead."
      },
      {
        question: "According to 1 Corinthians 6:19, your body is:",
        options: [
          "Just flesh and bones",
          "The temple of the Holy Spirit",
          "Not important to God",
          "Separate from your spiritual life"
        ],
        correctAnswer: 1,
        explanation: "1 Corinthians 6:19 clearly states that your body is the temple of the Holy Spirit who lives in you."
      },
      {
        question: "The baptism of the Holy Spirit is:",
        options: [
          "The same as water baptism",
          "The same as being born again",
          "An empowerment for service separate from salvation",
          "Only for pastors and ministers"
        ],
        correctAnswer: 2,
        explanation: "Jesus distinguished the baptism in the Holy Spirit from salvation, saying 'ye shall receive POWER' (Acts 1:8)."
      },
      {
        question: "According to Acts 2:4, what was the initial evidence of being filled with the Holy Spirit?",
        options: [
          "Falling down",
          "Speaking in tongues",
          "Crying",
          "Seeing visions"
        ],
        correctAnswer: 1,
        explanation: "Acts 2:4 records they 'began to speak with other tongues, as the Spirit gave them utterance.'"
      },
      {
        question: "Ephesians 5:18 tells us to 'be filled with the Spirit.' In Greek, this means:",
        options: [
          "Be filled once and you're done",
          "Be filled continually - it's ongoing",
          "Only pastors need this",
          "Wait for it to happen automatically"
        ],
        correctAnswer: 1,
        explanation: "The Greek tense means 'be being filled continually' - it's a continuous lifestyle, not a one-time event."
      }
    ],
    assignment: {
      title: "My Holy Spirit Journal",
      description: "Keep a daily journal for one week documenting: (1) Times you prayed in the Spirit (2) Promptings you received from the Holy Spirit (3) How you responded to His guidance. Share your experiences with your cell group.",
      type: "reflection",
      dueInDays: 7
    },
    passingScore: 70,
    isActive: true,
    order: 2
  },

  // ==========================================
  // CLASS 3: WATER BAPTISM
  // ==========================================
  {
    moduleNumber: 3,
    title: "Water Baptism",
    subtitle: "Identifying with Christ's Death and Resurrection",
    description: "Understand the significance of water baptism as your public declaration of faith and identification with Jesus Christ.",
    icon: "Droplets",
    color: "#3B82F6",
    duration: "1-2 hours",
    totalLessons: 3,
    lessons: [
      {
        lessonNumber: 1,
        title: "The Meaning of Water Baptism",
        content: `Water baptism is a public declaration and identification with Jesus Christ in His death, burial, and resurrection. It's not what saves you - you're saved by faith in Christ - but it's an important act of obedience.

Romans 6:3-4 explains: "Know ye not, that so many of us as were baptized into Jesus Christ were baptized into his death? Therefore we are buried with him by baptism into death: that like as Christ was raised up from the dead by the glory of the Father, even so we also should walk in newness of life."

The symbolism is powerful:
- Going DOWN into the water = burial of the old life
- Coming UP from the water = resurrection to new life

Water baptism is like a wedding ring - it doesn't make you married, but it's a symbol of your commitment. Your faith in Christ saves you; baptism is the outward expression of that inward reality.

Jesus was baptized (Matthew 3:13-17), setting an example for us. He commanded His disciples to baptize believers (Matthew 28:19). Every new believer in Acts was baptized.`,
        scriptureReferences: ["Romans 6:3-4", "Matthew 28:19", "Matthew 3:13-17", "Acts 2:38"],
        keyPoints: [
          "Baptism symbolizes death, burial, and resurrection with Christ",
          "It's an act of obedience, not a requirement for salvation",
          "Jesus was baptized and commanded us to be baptized",
          "It's a public declaration of your faith"
        ],
        memoryVerse: "Therefore we are buried with him by baptism into death: that like as Christ was raised up from the dead by the glory of the Father, even so we also should walk in newness of life. - Romans 6:4",
        duration: "30 minutes"
      },
      {
        lessonNumber: 2,
        title: "Who Should Be Baptized",
        content: `Water baptism is for believers - those who have received Jesus Christ as Lord and Savior. The biblical order is always: believe first, then be baptized.

Mark 16:16: "He that believeth and is baptized shall be saved."
Acts 2:41: "Then they that gladly received his word were baptized."
Acts 8:12: "But when they believed... they were baptized, both men and women."
Acts 16:33: "The jailer... was baptized, he and all his straightway."

In every case, belief came first, then baptism. This is why infant baptism is not practiced in Scripture - infants cannot believe.

You are ready for baptism if:
1. You have genuinely received Jesus as Lord and Savior
2. You understand what baptism represents
3. You want to publicly identify with Christ
4. You are committed to following Jesus

If you were baptized as an infant or before you truly believed, you should be baptized now as a believer. Your conscious decision to follow Christ and be baptized is what makes it meaningful.`,
        scriptureReferences: ["Mark 16:16", "Acts 2:41", "Acts 8:12", "Acts 16:33"],
        keyPoints: [
          "Baptism is for believers only",
          "Belief always comes before baptism in Scripture",
          "Infants cannot be baptized because they cannot believe",
          "If baptized before believing, be baptized as a believer"
        ],
        memoryVerse: "He that believeth and is baptized shall be saved. - Mark 16:16",
        duration: "30 minutes"
      },
      {
        lessonNumber: 3,
        title: "The Mode of Baptism",
        content: `The biblical mode of baptism is immersion - being fully submerged in water. The Greek word "baptizo" literally means "to dip, plunge, or immerse."

Evidence for immersion:
1. The meaning of the word requires it
2. Jesus went DOWN into and UP from the water (Mark 1:9-10)
3. Philip and the Ethiopian went INTO the water (Acts 8:38-39)
4. The symbolism requires it - burial means full coverage

Romans 6:4 speaks of being "buried with him by baptism" - you can't be buried by sprinkling!

The early church practiced immersion. Sprinkling only became common centuries later for convenience.

Preparation for your baptism:
1. Bring a change of clothes
2. Invite family and friends to witness
3. Prepare a testimony to share
4. Come with a heart of worship and celebration

Your baptism day is a celebration! You are publicly declaring that you belong to Jesus Christ. Heaven rejoices with you!`,
        scriptureReferences: ["Mark 1:9-10", "Acts 8:38-39", "Colossians 2:12", "Matthew 3:16"],
        keyPoints: [
          "Biblical baptism is by full immersion",
          "'Baptizo' means to dip, plunge, or immerse",
          "Jesus and the early church practiced immersion",
          "Immersion properly symbolizes burial and resurrection"
        ],
        memoryVerse: "Buried with him in baptism, wherein also ye are risen with him through the faith of the operation of God. - Colossians 2:12",
        duration: "30 minutes"
      }
    ],
    quiz: [
      {
        question: "What does water baptism primarily symbolize?",
        options: [
          "Washing away sins",
          "Joining a church",
          "Death, burial, and resurrection with Christ",
          "Becoming religious"
        ],
        correctAnswer: 2,
        explanation: "Romans 6:3-4 explains that baptism symbolizes our identification with Christ's death, burial, and resurrection."
      },
      {
        question: "According to Scripture, who should be baptized?",
        options: [
          "Everyone, including infants",
          "Only pastors and ministers",
          "Believers who have received Christ",
          "Only people who have been good"
        ],
        correctAnswer: 2,
        explanation: "In every biblical account, people believed first, then were baptized. Baptism is for believers."
      },
      {
        question: "The Greek word 'baptizo' means:",
        options: [
          "To sprinkle",
          "To pour",
          "To dip, plunge, or immerse",
          "To wash lightly"
        ],
        correctAnswer: 2,
        explanation: "The Greek word 'baptizo' literally means to dip, plunge, or immerse - requiring full submersion."
      }
    ],
    assignment: {
      title: "Baptism Preparation",
      description: "If you haven't been baptized as a believer, sign up for the next baptism service. Write a brief testimony (2-3 minutes) to share at your baptism about what Jesus means to you.",
      type: "practical",
      dueInDays: 14
    },
    passingScore: 70,
    isActive: true,
    order: 3
  },

  // ==========================================
  // CLASS 4: THE WORD OF GOD
  // ==========================================
  {
    moduleNumber: 4,
    title: "The Word of God",
    subtitle: "Your Foundation for Life and Victory",
    description: "Learn how to study, meditate on, and apply God's Word for daily victory and spiritual growth.",
    icon: "Book",
    color: "#8B5CF6",
    duration: "2-3 hours",
    totalLessons: 5,
    lessons: [
      {
        lessonNumber: 1,
        title: "What Is The Word of God?",
        content: `The Bible is not just any book - it is the inspired, infallible, inerrant Word of God. 2 Timothy 3:16 declares: "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness."

The phrase "inspiration of God" literally means "God-breathed." God breathed His words through human writers. It's God's message in human language.

The Word of God is:
1. ETERNAL - "For ever, O LORD, thy word is settled in heaven" (Psalm 119:89)
2. TRUE - "Thy word is true from the beginning" (Psalm 119:160)
3. POWERFUL - "For the word of God is quick, and powerful" (Hebrews 4:12)
4. LIFE-GIVING - "The words that I speak unto you, they are spirit, and they are life" (John 6:63)

The Bible contains 66 books, written by approximately 40 authors over 1,500 years, yet it has perfect unity because it has one divine Author - the Holy Spirit.

The Word is God speaking to you today. When you read the Bible, you're not reading ancient history - you're hearing God's voice for your life right now!`,
        scriptureReferences: ["2 Timothy 3:16", "Psalm 119:89", "Hebrews 4:12", "John 6:63"],
        keyPoints: [
          "The Bible is God-breathed and inspired",
          "The Word is eternal, true, and powerful",
          "66 books with perfect unity - one divine Author",
          "God speaks to you through His Word today"
        ],
        memoryVerse: "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness. - 2 Timothy 3:16",
        duration: "30 minutes"
      },
      {
        lessonNumber: 2,
        title: "The Power of God's Word",
        content: `God's Word has creative power. Everything God does, He does by His Word. Hebrews 11:3 says: "Through faith we understand that the worlds were framed by the word of God."

God spoke, and creation came into existence. His Word still has that same power today!

Isaiah 55:11: "So shall my word be that goeth forth out of my mouth: it shall not return unto me void, but it shall accomplish that which I please, and it shall prosper in the thing whereto I sent it."

The Word of God:
1. CREATES what it speaks (Genesis 1)
2. HEALS - "He sent his word, and healed them" (Psalm 107:20)
3. DELIVERS - "The truth shall make you free" (John 8:32)
4. BUILDS FAITH - "Faith cometh by hearing... the word of God" (Romans 10:17)
5. DEFEATS THE ENEMY - "The sword of the Spirit, which is the word of God" (Ephesians 6:17)

When you speak God's Word, you release its power into your situation. Jesus defeated Satan with "It is written..." You can do the same!`,
        scriptureReferences: ["Hebrews 11:3", "Isaiah 55:11", "Psalm 107:20", "Romans 10:17"],
        keyPoints: [
          "God's Word has creative power",
          "The Word accomplishes what God sends it to do",
          "Speaking the Word releases its power",
          "The Word is your weapon against the enemy"
        ],
        memoryVerse: "So shall my word be that goeth forth out of my mouth: it shall not return unto me void, but it shall accomplish that which I please. - Isaiah 55:11",
        duration: "30 minutes"
      },
      {
        lessonNumber: 3,
        title: "How To Study The Bible",
        content: `Effective Bible study requires more than casual reading. You need a systematic approach to understand and apply God's Word.

2 Timothy 2:15: "Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth."

Methods of Bible Study:

1. DEVOTIONAL READING
Read a portion daily for personal nourishment. Journal what God speaks to you.

2. SYSTEMATIC STUDY
Study book by book, understanding context, author, audience, and purpose.

3. TOPICAL STUDY
Study everything the Bible says about a specific topic (healing, faith, love, etc.)

4. WORD STUDY
Study the original Hebrew or Greek meaning of key words.

5. BIOGRAPHICAL STUDY
Study the life of a Bible character and learn from their example.

Study Tools:
- A good study Bible with notes
- Bible dictionary and concordance
- Multiple translations for comparison
- A notebook for recording insights

Set a specific time daily for Bible study. Start with the New Testament - the Gospels and Epistles. Let the Holy Spirit be your teacher (John 16:13).`,
        scriptureReferences: ["2 Timothy 2:15", "John 16:13", "Psalm 119:18", "Acts 17:11"],
        keyPoints: [
          "Study is different from casual reading",
          "Use different methods: devotional, systematic, topical, word, biographical",
          "Have good study tools",
          "Let the Holy Spirit teach you"
        ],
        memoryVerse: "Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth. - 2 Timothy 2:15",
        duration: "30 minutes"
      },
      {
        lessonNumber: 4,
        title: "Meditating On The Word",
        content: `Meditation is not emptying your mind - it's filling your mind with God's Word and thinking deeply on it. Joshua 1:8 promises: "This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night, that thou mayest observe to do according to all that is written therein: for then thou shalt make thy way prosperous, and then thou shalt have good success."

Biblical meditation means:
1. PONDERING - Thinking deeply on a scripture
2. SPEAKING - Saying it out loud repeatedly
3. VISUALIZING - Seeing yourself in the Word
4. APPLYING - Asking how it applies to your life

Psalm 1:2-3 describes the blessed person: "But his delight is in the law of the LORD; and in his law doth he meditate day and night. And he shall be like a tree planted by the rivers of water."

How to meditate:
1. Choose a verse or short passage
2. Read it slowly several times
3. Emphasize different words each time
4. Ask: What does this mean? What does it mean to ME?
5. Speak it out loud as your confession
6. Let it change your thinking and actions

Meditation transforms information into revelation!`,
        scriptureReferences: ["Joshua 1:8", "Psalm 1:2-3", "Psalm 119:97", "Proverbs 4:20-22"],
        keyPoints: [
          "Meditation is filling your mind with God's Word",
          "Involves pondering, speaking, visualizing, and applying",
          "Produces prosperity and success",
          "Transforms information into revelation"
        ],
        memoryVerse: "This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night... for then thou shalt make thy way prosperous. - Joshua 1:8",
        duration: "30 minutes"
      },
      {
        lessonNumber: 5,
        title: "Living By The Word",
        content: `The goal of Bible study is not just knowledge - it's transformation. James 1:22 warns: "But be ye doers of the word, and not hearers only, deceiving your own selves."

Jesus taught in Matthew 7:24-25: "Therefore whosoever heareth these sayings of mine, and doeth them, I will liken him unto a wise man, which built his house upon a rock: And the rain descended, and the floods came, and the winds blew, and beat upon that house; and it fell not: for it was founded upon a rock."

Living by the Word means:
1. HEARING the Word regularly (church, study, podcasts)
2. READING the Word daily
3. STUDYING the Word deeply
4. MEMORIZING key scriptures
5. MEDITATING day and night
6. SPEAKING the Word as your confession
7. DOING what the Word says

Romans 12:2: "And be not conformed to this world: but be ye transformed by the renewing of your mind."

Your mind is renewed by the Word. As your thinking changes, your life changes. The Word is your standard for every decision, your guide for every situation, and your weapon for every battle!`,
        scriptureReferences: ["James 1:22", "Matthew 7:24-25", "Romans 12:2", "Psalm 119:105"],
        keyPoints: [
          "Be a doer of the Word, not just a hearer",
          "The Word is your foundation for life",
          "Renew your mind with the Word daily",
          "The Word guides every decision"
        ],
        memoryVerse: "But be ye doers of the word, and not hearers only, deceiving your own selves. - James 1:22",
        duration: "30 minutes"
      }
    ],
    quiz: [
      {
        question: "According to 2 Timothy 3:16, 'inspiration of God' literally means:",
        options: [
          "Good ideas",
          "Human wisdom",
          "God-breathed",
          "Religious thoughts"
        ],
        correctAnswer: 2,
        explanation: "The Greek word for 'inspiration' means 'God-breathed' - God breathed His words through human writers."
      },
      {
        question: "What does Isaiah 55:11 promise about God's Word?",
        options: [
          "It might work sometimes",
          "It will not return void but accomplish its purpose",
          "It depends on our effort",
          "It only works for special people"
        ],
        correctAnswer: 1,
        explanation: "God promises His Word will not return void but will accomplish what He sends it to do."
      },
      {
        question: "Joshua 1:8 promises prosperity and success to those who:",
        options: [
          "Are lucky",
          "Work hard enough",
          "Meditate on the Word day and night",
          "Go to church occasionally"
        ],
        correctAnswer: 2,
        explanation: "Joshua 1:8 links prosperity and success directly to meditating on God's Word day and night."
      },
      {
        question: "According to James 1:22, we should be:",
        options: [
          "Hearers only",
          "Doers of the Word, not hearers only",
          "Critics of the Word",
          "Casual readers"
        ],
        correctAnswer: 1,
        explanation: "James warns against being 'hearers only' and commands us to be 'doers of the word.'"
      }
    ],
    assignment: {
      title: "My Word Journey",
      description: "Choose one verse to meditate on this week. Write it down, read it daily, speak it out loud, and journal how God speaks to you through it. Share with your cell group what you learned.",
      type: "reflection",
      dueInDays: 7
    },
    passingScore: 70,
    isActive: true,
    order: 4
  },

  // ==========================================
  // CLASS 5: PRAYER
  // ==========================================
  {
    moduleNumber: 5,
    title: "Prayer",
    subtitle: "Communicating with Your Heavenly Father",
    description: "Learn how to pray effectively, understand different types of prayer, and develop a consistent prayer life.",
    icon: "MessageCircle",
    color: "#EC4899",
    duration: "2-3 hours",
    totalLessons: 5,
    lessons: [
      {
        lessonNumber: 1,
        title: "What Is Prayer?",
        content: `Prayer is communication with God - talking to Him and listening to Him. It's not a religious duty but a relationship privilege.

Jesus gave us direct access to the Father. Hebrews 4:16 invites: "Let us therefore come boldly unto the throne of grace, that we may obtain mercy, and find grace to help in time of need."

Prayer is:
1. FELLOWSHIP with God - spending time with Him
2. WORSHIP - expressing love and adoration
3. PETITION - bringing your requests to Him
4. INTERCESSION - praying for others
5. LISTENING - hearing God speak to you

Through Jesus, you have direct access to God. No intermediary needed! Ephesians 2:18: "For through him we both have access by one Spirit unto the Father."

Prayer is not about fancy words or religious formulas. It's simply talking to your Father who loves you. Matthew 6:7-8 says: "But when ye pray, use not vain repetitions, as the heathen do... for your Father knoweth what things ye have need of, before ye ask him."

Come to God as you are. He's your Father - He delights in hearing from you!`,
        scriptureReferences: ["Hebrews 4:16", "Ephesians 2:18", "Matthew 6:7-8", "Philippians 4:6"],
        keyPoints: [
          "Prayer is communication with God - talking AND listening",
          "You have direct access through Jesus",
          "No fancy words or formulas needed",
          "God is your Father who loves hearing from you"
        ],
        memoryVerse: "Let us therefore come boldly unto the throne of grace, that we may obtain mercy, and find grace to help in time of need. - Hebrews 4:16",
        duration: "30 minutes"
      },
      {
        lessonNumber: 2,
        title: "How Jesus Taught Us To Pray",
        content: `Jesus gave us a model prayer in Matthew 6:9-13, commonly called "The Lord's Prayer." It's not meant to be recited mindlessly but to show us the elements of effective prayer.

"Our Father which art in heaven, Hallowed be thy name."
- Approach God as Father, with reverence and worship

"Thy kingdom come, Thy will be done in earth, as it is in heaven."
- Pray for God's purposes to be accomplished

"Give us this day our daily bread."
- Bring your needs to Him - He cares about your daily life

"And forgive us our debts, as we forgive our debtors."
- Receive forgiveness and extend forgiveness to others

"And lead us not into temptation, but deliver us from evil."
- Pray for guidance and protection

"For thine is the kingdom, and the power, and the glory, for ever."
- End with praise and acknowledgment of God's sovereignty

This prayer covers: WORSHIP, KINGDOM PRIORITIES, PERSONAL NEEDS, FORGIVENESS, PROTECTION, and PRAISE. Use this as a template, not a script!`,
        scriptureReferences: ["Matthew 6:9-13", "Luke 11:1-4", "John 14:13-14", "John 16:23-24"],
        keyPoints: [
          "The Lord's Prayer is a model, not a script",
          "Begin with worship and reverence",
          "Bring daily needs to God",
          "Include forgiveness, guidance, and praise"
        ],
        memoryVerse: "After this manner therefore pray ye: Our Father which art in heaven, Hallowed be thy name. - Matthew 6:9",
        duration: "30 minutes"
      },
      {
        lessonNumber: 3,
        title: "Praying In The Name of Jesus",
        content: `Jesus gave believers the authority to pray in His name. This is one of the greatest privileges we have!

John 14:13-14: "And whatsoever ye shall ask in my name, that will I do, that the Father may be glorified in the Son. If ye shall ask any thing in my name, I will do it."

John 16:23-24: "Verily, verily, I say unto you, Whatsoever ye shall ask the Father in my name, he will give it you. Hitherto have ye asked nothing in my name: ask, and ye shall receive, that your joy may be full."

Praying "in Jesus' name" means:
1. AUTHORITY - You come with Jesus' authority, as His representative
2. IDENTITY - You're identified with Christ and His finished work
3. AGREEMENT - Your request aligns with Jesus' will and character
4. ACCESS - The name of Jesus opens heaven's door

It's not a magic formula tacked on at the end. It's a position of authority. When you pray in Jesus' name, it's as if Jesus Himself is making the request!

The name of Jesus has all authority in heaven, on earth, and under the earth (Philippians 2:9-10). Use it with confidence!`,
        scriptureReferences: ["John 14:13-14", "John 16:23-24", "Philippians 2:9-10", "Mark 16:17"],
        keyPoints: [
          "Jesus gave us authority to use His name",
          "It's not a formula but a position of authority",
          "The name represents Jesus' identity and power",
          "Every prayer should be in Jesus' name"
        ],
        memoryVerse: "And whatsoever ye shall ask in my name, that will I do, that the Father may be glorified in the Son. - John 14:13",
        duration: "30 minutes"
      },
      {
        lessonNumber: 4,
        title: "Praying In The Spirit",
        content: `Beyond praying with your understanding, you can also pray in the Spirit - in tongues. This is a powerful weapon in your prayer life.

1 Corinthians 14:14-15: "For if I pray in an unknown tongue, my spirit prayeth, but my understanding is unfruitful. What is it then? I will pray with the spirit, and I will pray with the understanding also."

Jude 1:20: "But ye, beloved, building up yourselves on your most holy faith, praying in the Holy Ghost."

Benefits of praying in tongues:
1. Your spirit prays perfect prayers (Romans 8:26-27)
2. You build yourself up spiritually (Jude 1:20)
3. You pray mysteries and secrets (1 Corinthians 14:2)
4. You bypass your limited understanding
5. You strengthen your inner man
6. You stay sensitive to the Holy Spirit

Ephesians 6:18: "Praying always with all prayer and supplication in the Spirit."

Make praying in tongues a daily practice. Pray in the Spirit when you don't know how to pray. Let the Holy Spirit pray through you!`,
        scriptureReferences: ["1 Corinthians 14:14-15", "Jude 1:20", "Romans 8:26-27", "Ephesians 6:18"],
        keyPoints: [
          "Praying in tongues = praying in the Spirit",
          "Your spirit prays perfect prayers",
          "It builds you up spiritually",
          "Make it a daily practice"
        ],
        memoryVerse: "But ye, beloved, building up yourselves on your most holy faith, praying in the Holy Ghost. - Jude 1:20",
        duration: "30 minutes"
      },
      {
        lessonNumber: 5,
        title: "Developing A Prayer Life",
        content: `Effective prayer requires consistency. Jesus modeled a disciplined prayer life, often rising early to pray (Mark 1:35).

Building a consistent prayer life:

1. SET A TIME
Daniel prayed three times daily (Daniel 6:10). Find your best time and protect it.

2. FIND A PLACE
Jesus had a specific place to pray (Luke 22:39-40). Have your prayer spot.

3. HAVE A PLAN
Don't wander aimlessly. Use elements: Worship, Thanksgiving, Word, Intercession, Personal requests, Tongues.

4. BE PERSISTENT
Luke 18:1: "Men ought always to pray, and not to faint."

5. PRAY THROUGHOUT THE DAY
1 Thessalonians 5:17: "Pray without ceasing." Quick prayers throughout the day maintain connection.

6. KEEP A PRAYER JOURNAL
Record requests, answers, and what God speaks to you.

7. JOIN WITH OTHERS
Matthew 18:19-20: Corporate prayer has multiplied power.

Start with what you can sustain - even 15 minutes daily. Quality matters more than quantity. The goal is relationship, not performance!`,
        scriptureReferences: ["Mark 1:35", "Daniel 6:10", "Luke 18:1", "1 Thessalonians 5:17"],
        keyPoints: [
          "Consistency is key - set a time and place",
          "Have a plan but be flexible to the Spirit",
          "Be persistent - don't give up",
          "Pray throughout the day"
        ],
        memoryVerse: "Pray without ceasing. - 1 Thessalonians 5:17",
        duration: "30 minutes"
      }
    ],
    quiz: [
      {
        question: "According to Hebrews 4:16, how should we approach God's throne?",
        options: [
          "Fearfully and timidly",
          "Only through a priest",
          "Boldly, to obtain mercy and grace",
          "Only when we're perfect"
        ],
        correctAnswer: 2,
        explanation: "We can come 'boldly unto the throne of grace' because of Jesus' finished work."
      },
      {
        question: "What does praying 'in Jesus' name' mean?",
        options: [
          "A magic formula to get what you want",
          "Just words to say at the end",
          "Coming with Jesus' authority as His representative",
          "Something only pastors can do"
        ],
        correctAnswer: 2,
        explanation: "Praying in Jesus' name means coming with His authority, identified with Him and His finished work."
      },
      {
        question: "According to Jude 1:20, praying in the Holy Spirit does what?",
        options: [
          "Makes you tired",
          "Builds you up on your most holy faith",
          "Is only for advanced Christians",
          "Is not important"
        ],
        correctAnswer: 1,
        explanation: "Praying in the Spirit 'builds you up on your most holy faith' - it strengthens you spiritually."
      },
      {
        question: "1 Thessalonians 5:17 instructs us to:",
        options: [
          "Pray only on Sundays",
          "Pray when we feel like it",
          "Pray without ceasing",
          "Pray only in emergencies"
        ],
        correctAnswer: 2,
        explanation: "'Pray without ceasing' means maintaining constant communion with God throughout the day."
      }
    ],
    assignment: {
      title: "My Prayer Journal",
      description: "Start a prayer journal. Daily for one week: (1) Write 3 things you're thankful for (2) Record your prayer requests (3) Note any answers or things God speaks to you. Bring your journal to share with your cell group.",
      type: "practical",
      dueInDays: 7
    },
    passingScore: 70,
    isActive: true,
    order: 5
  },

  // ==========================================
  // CLASS 6: CHRISTIAN DOCTRINES
  // ==========================================
  {
    moduleNumber: 6,
    title: "Christian Doctrines",
    subtitle: "Foundational Truths of the Faith",
    description: "Understand essential Christian doctrines including the Trinity, salvation, the Church, and the return of Christ.",
    icon: "Scroll",
    color: "#059669",
    duration: "2-3 hours",
    totalLessons: 5,
    lessons: [
      {
        lessonNumber: 1,
        title: "The Doctrine of God",
        content: `Christianity teaches that there is one God who exists eternally in three Persons: Father, Son, and Holy Spirit. This is called the Trinity.

Deuteronomy 6:4: "Hear, O Israel: The LORD our God is one LORD."

Yet Scripture reveals three distinct Persons:
- The Father is God (1 Peter 1:2)
- The Son (Jesus) is God (John 1:1, Hebrews 1:8)
- The Holy Spirit is God (Acts 5:3-4)

These three are one God - not three gods. Matthew 28:19: "baptizing them in the name [singular] of the Father, and of the Son, and of the Holy Ghost."

Attributes of God:
1. OMNIPOTENT - All-powerful (Jeremiah 32:17)
2. OMNISCIENT - All-knowing (Psalm 147:5)
3. OMNIPRESENT - Everywhere present (Psalm 139:7-10)
4. ETERNAL - No beginning or end (Psalm 90:2)
5. HOLY - Perfectly pure (Isaiah 6:3)
6. LOVE - God is love (1 John 4:8)
7. JUST - Perfectly fair (Deuteronomy 32:4)

God is both transcendent (above and beyond creation) and immanent (personally involved with His creation).`,
        scriptureReferences: ["Deuteronomy 6:4", "Matthew 28:19", "John 1:1", "1 John 4:8"],
        keyPoints: [
          "One God in three Persons - the Trinity",
          "Father, Son, and Holy Spirit are each fully God",
          "God is all-powerful, all-knowing, everywhere present",
          "God is love, holy, and just"
        ],
        memoryVerse: "Hear, O Israel: The LORD our God is one LORD. - Deuteronomy 6:4",
        duration: "30 minutes"
      },
      {
        lessonNumber: 2,
        title: "The Doctrine of Christ",
        content: `Jesus Christ is the eternal Son of God who became man. He is fully God and fully man - two natures in one Person.

His deity:
- Existed before creation (John 1:1-3)
- Equal with the Father (John 10:30)
- Called God (Hebrews 1:8)
- Worshipped as God (Matthew 14:33)

His humanity:
- Born of a virgin (Matthew 1:23)
- Grew and developed (Luke 2:52)
- Experienced hunger, thirst, tiredness
- Died a real death

Why did God become man?
1. To reveal God to us (John 14:9)
2. To die for our sins (1 Peter 3:18)
3. To destroy the devil's works (1 John 3:8)
4. To be our High Priest (Hebrews 4:15)
5. To be our example (1 Peter 2:21)

Jesus lived a sinless life, died on the cross for our sins, rose from the dead on the third day, and ascended to heaven where He is seated at God's right hand. He is coming again!`,
        scriptureReferences: ["John 1:1-3", "John 14:9", "1 Peter 3:18", "Hebrews 4:15"],
        keyPoints: [
          "Jesus is fully God and fully man",
          "He came to reveal God and save us from sin",
          "He lived sinlessly, died, and rose again",
          "He is coming back!"
        ],
        memoryVerse: "For there is one God, and one mediator between God and men, the man Christ Jesus. - 1 Timothy 2:5",
        duration: "30 minutes"
      },
      {
        lessonNumber: 3,
        title: "The Doctrine of Salvation",
        content: `Salvation is God's gift of eternal life through faith in Jesus Christ. It includes justification, sanctification, and glorification.

Ephesians 2:8-9: "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast."

Key aspects of salvation:

1. JUSTIFICATION - Declared righteous
Romans 5:1: "Therefore being justified by faith, we have peace with God through our Lord Jesus Christ."
This is a legal declaration - not guilty! It happens instantly when you believe.

2. SANCTIFICATION - Being set apart and transformed
This is an ongoing process of becoming more like Christ.
Philippians 2:12-13: "Work out your own salvation with fear and trembling. For it is God which worketh in you."

3. GLORIFICATION - Future completion
Romans 8:30: "Moreover whom he did predestinate, them he also called... justified... glorified."
Our salvation will be complete when we receive our glorified bodies.

Salvation cannot be earned - it's received by faith. But saving faith produces evidence: love, obedience, good works, and transformation.`,
        scriptureReferences: ["Ephesians 2:8-9", "Romans 5:1", "Philippians 2:12-13", "Romans 8:30"],
        keyPoints: [
          "Salvation is by grace through faith, not works",
          "Justification - declared righteous instantly",
          "Sanctification - transformed progressively",
          "Glorification - completed eternally"
        ],
        memoryVerse: "For by grace are ye saved through faith; and that not of yourselves: it is the gift of God. - Ephesians 2:8",
        duration: "30 minutes"
      },
      {
        lessonNumber: 4,
        title: "The Doctrine of The Church",
        content: `The Church is the body of Christ - all believers worldwide throughout all ages. It is also expressed in local congregations.

Matthew 16:18: "Upon this rock I will build my church; and the gates of hell shall not prevail against it."

The Church is described as:
1. THE BODY OF CHRIST - Christ is the head (Ephesians 1:22-23)
2. THE BRIDE OF CHRIST - United to Him in love (Ephesians 5:25-27)
3. THE TEMPLE OF GOD - God's dwelling place (1 Corinthians 3:16)
4. THE FAMILY OF GOD - Brothers and sisters (Galatians 6:10)

Local church membership is essential because:
- We need fellowship (Hebrews 10:25)
- We need accountability (Galatians 6:1-2)
- We need teaching (Ephesians 4:11-13)
- We need to serve (1 Peter 4:10)
- We need pastoral covering (Hebrews 13:17)

The church has two ordinances: Water Baptism and the Lord's Supper (Communion). Both are symbolic acts of obedience, not requirements for salvation but important for believers.

Be committed to your local church!`,
        scriptureReferences: ["Matthew 16:18", "Ephesians 1:22-23", "Hebrews 10:25", "1 Peter 4:10"],
        keyPoints: [
          "The Church is the body and bride of Christ",
          "Local church membership is essential",
          "We need fellowship, accountability, teaching, and service",
          "Baptism and Communion are important ordinances"
        ],
        memoryVerse: "Upon this rock I will build my church; and the gates of hell shall not prevail against it. - Matthew 16:18",
        duration: "30 minutes"
      },
      {
        lessonNumber: 5,
        title: "The Doctrine of Last Things",
        content: `The Bible teaches that Jesus Christ is coming again! This is our "blessed hope" (Titus 2:13).

Key events in God's prophetic plan:

1. THE RAPTURE
1 Thessalonians 4:16-17: "For the Lord himself shall descend from heaven with a shout... and the dead in Christ shall rise first: Then we which are alive and remain shall be caught up together with them in the clouds, to meet the Lord in the air."

2. THE TRIBULATION
A seven-year period of God's judgment on earth (Revelation chapters 6-19).

3. THE SECOND COMING
Jesus returns visibly to earth to defeat His enemies and establish His kingdom (Revelation 19:11-16).

4. THE MILLENNIUM
Christ's thousand-year reign on earth (Revelation 20:1-6).

5. THE GREAT WHITE THRONE JUDGMENT
Final judgment of unbelievers (Revelation 20:11-15).

6. THE NEW HEAVEN AND NEW EARTH
Eternity with God (Revelation 21-22).

We don't know the exact timing, but we're called to be ready and watching. Matthew 24:44: "Therefore be ye also ready: for in such an hour as ye think not the Son of man cometh."`,
        scriptureReferences: ["1 Thessalonians 4:16-17", "Titus 2:13", "Revelation 19:11-16", "Matthew 24:44"],
        keyPoints: [
          "Jesus is coming again - our blessed hope",
          "The Rapture - believers caught up to meet Jesus",
          "The Second Coming - Jesus returns to earth visibly",
          "We must be ready and watching"
        ],
        memoryVerse: "For the Lord himself shall descend from heaven with a shout... and so shall we ever be with the Lord. - 1 Thessalonians 4:16-17",
        duration: "30 minutes"
      }
    ],
    quiz: [
      {
        question: "The Trinity means:",
        options: [
          "Three separate gods",
          "One God in three Persons",
          "God has three different names",
          "God changes forms"
        ],
        correctAnswer: 1,
        explanation: "The Trinity is one God eternally existing in three distinct Persons: Father, Son, and Holy Spirit."
      },
      {
        question: "Jesus Christ is:",
        options: [
          "Just a good teacher",
          "Just a prophet",
          "Fully God and fully man",
          "An angel"
        ],
        correctAnswer: 2,
        explanation: "Jesus is the eternal Son of God who became man - two natures in one Person, fully God and fully man."
      },
      {
        question: "According to Ephesians 2:8-9, salvation is:",
        options: [
          "Earned by good works",
          "By grace through faith, a gift of God",
          "Only for special people",
          "Uncertain until you die"
        ],
        correctAnswer: 1,
        explanation: "Salvation is by grace through faith, not of works - it's a gift from God that we receive."
      },
      {
        question: "The Rapture refers to:",
        options: [
          "A feeling of joy",
          "Believers being caught up to meet Jesus in the air",
          "The end of the world",
          "Going to church"
        ],
        correctAnswer: 1,
        explanation: "1 Thessalonians 4:16-17 describes believers being 'caught up' to meet the Lord in the air."
      }
    ],
    assignment: {
      title: "Doctrine Summary",
      description: "Write a one-page summary of what you now believe about: God, Jesus, Salvation, and the Church. Include at least one scripture reference for each. Be prepared to share in your cell group.",
      type: "written",
      dueInDays: 7
    },
    passingScore: 70,
    isActive: true,
    order: 6
  },

  // ==========================================
  // CLASS 7: CHRISTIAN LIVING
  // ==========================================
  {
    moduleNumber: 7,
    title: "Christian Living",
    subtitle: "Walking Out Your Faith Daily",
    description: "Learn practical principles for living the Christian life: faith, giving, witnessing, and fulfilling your purpose.",
    icon: "Heart",
    color: "#DC2626",
    duration: "2-3 hours",
    totalLessons: 5,
    lessons: [
      {
        lessonNumber: 1,
        title: "Walking By Faith",
        content: `The Christian life is a life of faith. Hebrews 11:6 declares: "But without faith it is impossible to please him: for he that cometh to God must believe that he is, and that he is a rewarder of them that diligently seek him."

2 Corinthians 5:7: "For we walk by faith, not by sight."

What is faith?
Hebrews 11:1: "Now faith is the substance of things hoped for, the evidence of things not seen."

Faith is:
1. TRUSTING GOD'S WORD - not feelings, circumstances, or logic
2. ACTING ON GOD'S WORD - faith without works is dead (James 2:17)
3. SPEAKING GOD'S WORD - out of the heart the mouth speaks (Matthew 12:34)

How to develop your faith:
1. HEAR THE WORD - Romans 10:17: "Faith cometh by hearing, and hearing by the word of God."
2. MEDITATE ON THE WORD - Let it get into your heart
3. SPEAK THE WORD - Confess what God says
4. ACT ON THE WORD - Do what it says

Faith is not denying reality - it's responding to a higher reality: God's Word. When what you see contradicts what God says, choose to believe God!`,
        scriptureReferences: ["Hebrews 11:1", "Hebrews 11:6", "2 Corinthians 5:7", "Romans 10:17"],
        keyPoints: [
          "Without faith it's impossible to please God",
          "Faith is trusting and acting on God's Word",
          "Faith comes by hearing God's Word",
          "Walk by faith, not by sight"
        ],
        memoryVerse: "Now faith is the substance of things hoped for, the evidence of things not seen. - Hebrews 11:1",
        duration: "30 minutes"
      },
      {
        lessonNumber: 2,
        title: "Giving and Stewardship",
        content: `Everything belongs to God - we are stewards (managers) of what He has given us. This includes our time, talents, and treasures.

Psalm 24:1: "The earth is the LORD's, and the fulness thereof; the world, and they that dwell therein."

Principles of giving:

1. THE TITHE
Malachi 3:10: "Bring ye all the tithes into the storehouse." The tithe (10%) is the Lord's - it belongs to Him. When you tithe, you're simply returning what's His.

2. OFFERINGS
Beyond the tithe, we give offerings as led by the Spirit. 2 Corinthians 9:7: "Every man according as he purposeth in his heart, so let him give; not grudgingly, or of necessity: for God loveth a cheerful giver."

3. ALMS
Giving to the poor. Proverbs 19:17: "He that hath pity upon the poor lendeth unto the LORD; and that which he hath given will he pay him again."

Benefits of giving:
- God opens windows of heaven (Malachi 3:10)
- You receive a harvest (2 Corinthians 9:6)
- Your needs are met (Philippians 4:19)
- You invest in eternity (Matthew 6:20)

Give with a cheerful heart, trusting God as your source!`,
        scriptureReferences: ["Malachi 3:10", "2 Corinthians 9:6-7", "Luke 6:38", "Philippians 4:19"],
        keyPoints: [
          "Everything belongs to God - we are stewards",
          "The tithe (10%) belongs to the Lord",
          "Give offerings cheerfully as led",
          "Generous giving brings blessing"
        ],
        memoryVerse: "Bring ye all the tithes into the storehouse... and prove me now herewith, saith the LORD of hosts, if I will not open you the windows of heaven. - Malachi 3:10",
        duration: "30 minutes"
      },
      {
        lessonNumber: 3,
        title: "Witnessing for Christ",
        content: `Every believer is called to be a witness for Christ. Jesus commanded in Mark 16:15: "Go ye into all the world, and preach the gospel to every creature."

Acts 1:8: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me."

What is witnessing?
Simply telling others what you know about Jesus and what He has done for you. You don't need to be an expert - just share your testimony!

How to witness effectively:

1. LIVE IT
Your life is your greatest testimony. Matthew 5:16: "Let your light so shine before men, that they may see your good works, and glorify your Father."

2. PRAY FOR OPPORTUNITIES
Ask God to bring people across your path who need to hear.

3. BE READY
1 Peter 3:15: "Be ready always to give an answer to every man that asketh you a reason of the hope that is in you."

4. KEEP IT SIMPLE
Share your story: what your life was like before Christ, how you met Him, and how He has changed you.

5. TRUST THE HOLY SPIRIT
He will give you the words (Luke 12:12).

Your testimony is powerful - no one can argue with your experience!`,
        scriptureReferences: ["Mark 16:15", "Acts 1:8", "Matthew 5:16", "1 Peter 3:15"],
        keyPoints: [
          "Every believer is called to witness",
          "Your life is your greatest testimony",
          "Share your personal story",
          "The Holy Spirit empowers you"
        ],
        memoryVerse: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me. - Acts 1:8",
        duration: "30 minutes"
      },
      {
        lessonNumber: 4,
        title: "Dealing With Temptation",
        content: `Temptation is common to all believers, but God provides a way of escape. 1 Corinthians 10:13: "There hath no temptation taken you but such as is common to man: but God is faithful, who will not suffer you to be tempted above that ye are able; but will with the temptation also make a way to escape."

Understanding temptation:
- Temptation itself is not sin - even Jesus was tempted (Hebrews 4:15)
- Sin happens when we yield to temptation (James 1:14-15)
- The enemy uses the lust of the flesh, lust of the eyes, and pride of life (1 John 2:16)

How to overcome temptation:

1. KNOW THE WORD
Jesus defeated Satan with "It is written" (Matthew 4:4,7,10).

2. FLEE FROM EVIL
2 Timothy 2:22: "Flee also youthful lusts." Some things you don't fight - you run!

3. RESIST THE DEVIL
James 4:7: "Submit yourselves therefore to God. Resist the devil, and he will flee from you."

4. GUARD YOUR MIND
Philippians 4:8: Think on things that are true, honest, just, pure, lovely.

5. STAY IN FELLOWSHIP
Ecclesiastes 4:9-10: "Two are better than one."

You have authority over sin. Romans 6:14: "Sin shall not have dominion over you."`,
        scriptureReferences: ["1 Corinthians 10:13", "James 4:7", "Hebrews 4:15", "Romans 6:14"],
        keyPoints: [
          "Temptation is common but God provides escape",
          "Use God's Word to defeat temptation",
          "Flee from evil, resist the devil",
          "Sin has no dominion over you"
        ],
        memoryVerse: "Submit yourselves therefore to God. Resist the devil, and he will flee from you. - James 4:7",
        duration: "30 minutes"
      },
      {
        lessonNumber: 5,
        title: "Finding Your Purpose",
        content: `God created you for a purpose. Ephesians 2:10: "For we are his workmanship, created in Christ Jesus unto good works, which God hath before ordained that we should walk in them."

You are not an accident. Before you were born, God had a plan for your life!

Jeremiah 29:11: "For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end."

Discovering your purpose:

1. KNOW GOD'S GENERAL WILL
The Word reveals God's will for ALL believers: to worship, grow, serve, fellowship, and witness.

2. DISCOVER YOUR GIFTS
What has God equipped you to do? What do you do well? What energizes you?

3. IDENTIFY YOUR PASSION
What burdens you? What moves you? What needs do you notice?

4. SEEK GOD IN PRAYER
Proverbs 3:5-6: "Trust in the LORD with all thine heart... and he shall direct thy paths."

5. GET INVOLVED IN CHURCH
Start serving somewhere. Purpose is often discovered through action.

6. BE FAITHFUL IN THE SMALL THINGS
Luke 16:10: "He that is faithful in that which is least is faithful also in much."

Your life matters. Live on purpose, for God's purpose!`,
        scriptureReferences: ["Ephesians 2:10", "Jeremiah 29:11", "Proverbs 3:5-6", "Luke 16:10"],
        keyPoints: [
          "God created you with a purpose",
          "Discover your gifts and passions",
          "Seek God's guidance in prayer",
          "Be faithful in small things"
        ],
        memoryVerse: "For we are his workmanship, created in Christ Jesus unto good works, which God hath before ordained that we should walk in them. - Ephesians 2:10",
        duration: "30 minutes"
      }
    ],
    quiz: [
      {
        question: "According to Romans 10:17, how does faith come?",
        options: [
          "By seeing miracles",
          "By hearing the Word of God",
          "Automatically over time",
          "By going to church"
        ],
        correctAnswer: 1,
        explanation: "Romans 10:17 says 'Faith cometh by hearing, and hearing by the word of God.'"
      },
      {
        question: "The tithe is:",
        options: [
          "Whatever you feel like giving",
          "Only for wealthy people",
          "10% that belongs to the Lord",
          "No longer required"
        ],
        correctAnswer: 2,
        explanation: "The tithe (10%) belongs to the Lord and should be brought to the storehouse (Malachi 3:10)."
      },
      {
        question: "According to James 4:7, what happens when we resist the devil?",
        options: [
          "He fights harder",
          "Nothing happens",
          "He will flee from us",
          "We need more power"
        ],
        correctAnswer: 2,
        explanation: "James 4:7 promises that when we submit to God and resist the devil, 'he will flee from you.'"
      },
      {
        question: "Ephesians 2:10 says we are created for:",
        options: [
          "Good works that God prepared beforehand",
          "Whatever we want to do",
          "Nothing specific",
          "Only religious activities"
        ],
        correctAnswer: 0,
        explanation: "We are 'created in Christ Jesus unto good works, which God hath before ordained that we should walk in them.'"
      }
    ],
    assignment: {
      title: "My Life Purpose Statement",
      description: "Prayerfully write a personal life purpose statement (1-3 sentences) that captures how you believe God wants to use your life. Include your spiritual gifts, passions, and how you want to impact others. Share with your cell leader for feedback.",
      type: "written",
      dueInDays: 7
    },
    passingScore: 70,
    isActive: true,
    order: 7
  }
];

// Seed function
async function seedFoundationSchool() {
  try {
    console.log('🌱 Starting Foundation School March 2025 seed...');
    console.log(`📚 Seeding ${modules.length} modules...`);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing modules
    await FoundationModule.deleteMany({});
    console.log('🗑️  Cleared existing Foundation School modules');

    // Insert new modules
    const result = await FoundationModule.insertMany(modules);
    console.log(`✅ Successfully seeded ${result.length} Foundation School modules`);

    // Summary
    let totalLessons = 0;
    let totalQuizQuestions = 0;
    
    modules.forEach((m, i) => {
      totalLessons += m.lessons.length;
      totalQuizQuestions += m.quiz.length;
      console.log(`   ${i + 1}. ${m.title} - ${m.lessons.length} lessons, ${m.quiz.length} quiz questions`);
    });

    console.log('\n📊 SEED SUMMARY:');
    console.log(`   Total Modules: ${modules.length}`);
    console.log(`   Total Lessons: ${totalLessons}`);
    console.log(`   Total Quiz Questions: ${totalQuizQuestions}`);
    console.log('\n✅ Foundation School March 2025 seed complete!');
    
  } catch (error) {
    console.error('❌ Seed error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

// Run if executed directly
if (require.main === module) {
  seedFoundationSchool();
}

module.exports = { modules, seedFoundationSchool };
