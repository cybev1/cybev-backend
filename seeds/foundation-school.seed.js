// ============================================
// FILE: seeds/foundation-school.seed.js
// Foundation School Modules - Based on Official Manual
// 7 Classes + Graduation (8 weeks total)
// Run with: node seeds/foundation-school.seed.js
// ============================================

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cybev';

const FoundationModuleSchema = new mongoose.Schema({
  title: String, description: String, moduleNumber: Number, classWeek: Number,
  content: {
    introduction: String, learningObjective: String,
    lessons: [{ title: String, content: String, videoUrl: String, audioUrl: String, duration: Number, resources: [{ title: String, type: String, url: String }] }],
    scriptures: [String], memoryVerse: String, keyPoints: [String], practicalExercises: [String]
  },
  quiz: [{ question: String, options: [String], correctAnswer: Number, explanation: String }],
  passingScore: Number, duration: Number, isRequired: Boolean, order: Number, isActive: Boolean, createdAt: Date
});

const FoundationModule = mongoose.model('FoundationModule', FoundationModuleSchema);

const foundationSchoolModules = [
  {
    moduleNumber: 1, classWeek: 1, title: "The New Creature",
    description: "Understanding your new identity in Christ - what happened when you were born again",
    content: {
      introduction: "The term 'new creature' is directly from scriptures (2 Cor 5:17), and describes the new man in Christ. This new creature has a new life and therefore a new nature from God, superior to defeat or failure.",
      learningObjective: "To help every participant understand they are a new creature with a life and nature from God, destined for glory and virtue.",
      lessons: [
        { title: "Understanding John 3:16", content: "If you believe in Jesus, you are forever separated from those that should perish. You have been delivered from darkness and translated into the kingdom of His dear Son (Col 1:13). You have received eternal life, righteousness, and fellowship with God.", duration: 20 },
        { title: "The Lordship of Jesus", content: "Romans 10:9 - The confession of Jesus' Lordship brings salvation. He becomes your Lord - Master, Ruler over every area of your life.", duration: 15 },
        { title: "What You Have Received", content: "As a new creature, you received: Eternal Life (1 John 5:11-12), Righteousness (Romans 5:18-19), Fellowship with God (1 John 1:3).", duration: 20 },
        { title: "Your Divine Nature", content: "2 Peter 1:4 reveals you are a partaker of the divine nature! You have God's nature on the inside - this is who you already are!", duration: 15 }
      ],
      scriptures: ["2 Corinthians 5:17-18", "John 3:16", "Romans 10:9-10", "2 Peter 1:3-4", "Colossians 1:13"],
      memoryVerse: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new. - 2 Corinthians 5:17",
      keyPoints: ["You are already a new creature", "Your spirit has been recreated by God", "You are separated from failure and defeat", "You are a partaker of God's divine nature"],
      practicalExercises: ["Daily confess: 'I am a new creature in Christ!'", "Read 2 Corinthians 5:17 every morning", "Share your salvation testimony with one person"]
    },
    quiz: [
      { question: "What does being 'in Christ' mean according to 2 Corinthians 5:17?", options: ["You try to be good", "You become a new creature", "You join a church", "You follow rules"], correctAnswer: 1, explanation: "Being in Christ means you are a brand new creature!" },
      { question: "What brings salvation according to Romans 10:9?", options: ["Confessing sins", "Confessing Jesus as Lord", "Church membership", "Good works"], correctAnswer: 1, explanation: "The confession of Jesus' Lordship brings salvation." },
      { question: "What have you become according to 2 Peter 1:4?", options: ["Religious", "A partaker of divine nature", "A church member", "A good person"], correctAnswer: 1, explanation: "You are a partaker of God's divine nature!" }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 1, isActive: true
  },
  {
    moduleNumber: 2, classWeek: 2, title: "The Holy Spirit",
    description: "Understanding the ministry of the Holy Spirit in the life of every Christian",
    content: {
      introduction: "The Ministry of the Holy Spirit is not optional. It is not possible to live a successful Christian life without the Holy Spirit.",
      learningObjective: "To provide understanding into the essential, active ministry of the Holy Spirit in every Christian's life.",
      lessons: [
        { title: "The Person of the Holy Spirit", content: "The Holy Spirit is a Person, the third Person of the Godhead. He speaks (Acts 13:2), teaches (John 14:26), guides (John 16:13), and can be grieved (Ephesians 4:30). He is God!", duration: 20 },
        { title: "The Baptism of the Holy Spirit", content: "The Baptism of the Holy Spirit occurs at salvation - the Holy Spirit baptizes you into the Body of Christ (1 Cor 12:13).", duration: 15 },
        { title: "Receiving the Holy Spirit", content: "Receiving the Holy Spirit is distinct from baptism. Acts 19:2 - 'Have you received the Holy Spirit since you believed?' The evidence is speaking in tongues (Acts 2:4).", duration: 20 },
        { title: "Walking in the Spirit", content: "Galatians 5:16 - Walk in the Spirit and you won't fulfill the lusts of the flesh. Be led by the Spirit in every area of life.", duration: 15 },
        { title: "The Gifts of the Spirit", content: "1 Corinthians 12:7-11 lists nine gifts: wisdom, knowledge, faith, healing, miracles, prophecy, discerning, tongues, interpretation.", duration: 15 }
      ],
      scriptures: ["John 14:16-20", "Acts 1:8", "Acts 2:1-4", "1 Corinthians 12:13", "Galatians 5:16-25"],
      memoryVerse: "But ye shall receive power, after that the Holy Ghost is come upon you. - Acts 1:8",
      keyPoints: ["The Holy Spirit is a Person, not a force", "His ministry is essential", "Speaking in tongues is the evidence", "Be continuously filled with the Spirit"],
      practicalExercises: ["Pray for the Holy Spirit's filling daily", "Practice speaking in tongues 15 minutes daily", "Ask the Holy Spirit for guidance in decisions"]
    },
    quiz: [
      { question: "Who is the Holy Spirit?", options: ["A force", "An influence", "The third Person of the Godhead", "A feeling"], correctAnswer: 2, explanation: "The Holy Spirit is God - the third Person of the Trinity!" },
      { question: "What is the evidence of receiving the Holy Spirit?", options: ["Feeling emotional", "Speaking in tongues", "Good behavior", "Church attendance"], correctAnswer: 1, explanation: "Speaking in tongues is the evidence (Acts 2:4)." },
      { question: "What does Acts 1:8 promise believers?", options: ["Wealth", "Power", "Problems", "Rules"], correctAnswer: 1, explanation: "You shall receive power when the Holy Spirit comes upon you!" }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 2, isActive: true
  },
  {
    moduleNumber: 3, classWeek: 3, title: "Christian Doctrines",
    description: "The supremacy of the Bible and key Christian doctrines",
    content: {
      introduction: "Understanding the supremacy of the Bible, living in two worlds, and essential Christian doctrines.",
      learningObjective: "To establish believers in sound doctrine and understand their position as citizens of heaven living on earth.",
      lessons: [
        { title: "The Supremacy of the Bible", content: "The Bible is infallible, has no contradictions, and is complete. It is profitable for doctrine, reproof, correction, and instruction in righteousness (2 Timothy 3:16).", duration: 20 },
        { title: "Living in Two Worlds", content: "You have been translated into God's Kingdom instantly at salvation. You are there now, not waiting for heaven. You are a citizen of heaven operating on earth.", duration: 20 },
        { title: "Key Christian Doctrines", content: "Essential doctrines: Trinity, Deity of Christ, Virgin Birth, Substitutionary Atonement, Bodily Resurrection, Salvation by Grace, Second Coming, Heaven and Hell.", duration: 25 },
        { title: "Christian Apologetics", content: "1 Peter 3:15 - Always be ready to give a defense for the hope that is in you. Be prepared to explain why you believe.", duration: 15 }
      ],
      scriptures: ["2 Timothy 3:16-17", "Colossians 1:13", "Philippians 3:20", "1 Peter 3:15"],
      memoryVerse: "All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness. - 2 Timothy 3:16",
      keyPoints: ["The Bible is the infallible Word of God", "You are already in God's Kingdom", "Doctrines are foundational truths", "Be ready to defend your faith"],
      practicalExercises: ["Read one chapter of the Bible daily", "Write down five key doctrines with scriptures", "Practice explaining your faith"]
    },
    quiz: [
      { question: "What is the Bible?", options: ["A good book", "The infallible Word of God", "Ancient history", "Religious literature"], correctAnswer: 1, explanation: "The Bible is the infallible, complete Word of God!" },
      { question: "When did you enter God's Kingdom?", options: ["When you die", "When baptized", "Instantly at salvation", "After years of service"], correctAnswer: 2, explanation: "You were translated into God's Kingdom instantly at salvation!" }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 3, isActive: true
  },
  {
    moduleNumber: 4, classWeek: 4, title: "Evangelism - Soul Winning",
    description: "From soul saving to soul winning - reaching and discipling others",
    content: {
      introduction: "Evangelism is reaching others with the message of salvation. Soul winning goes beyond soul saving - it includes discipleship.",
      learningObjective: "To understand the difference between soul saving and soul winning, and be equipped to disciple new believers.",
      lessons: [
        { title: "The Great Commission", content: "Matthew 28:19-20 - Go, teach all nations, baptize, and teach them to observe all things. We must make disciples, not just converts.", duration: 20 },
        { title: "Soul Saving vs Soul Winning", content: "Like giving birth, the work doesn't end at salvation. A newborn child needs care and nurturing. New believers need follow-up and discipleship.", duration: 20 },
        { title: "Sharing Your Testimony", content: "Share: 1) Life before Christ, 2) How you met Jesus, 3) Life now. Keep it simple, sincere, and Christ-centered.", duration: 15 },
        { title: "Leading Someone to Christ", content: "Use the Romans Road: John 3:16 (God's love), Romans 3:23 (all sinned), Romans 6:23 (gift of salvation), Romans 10:9-10 (confession).", duration: 20 },
        { title: "Follow-up and Discipleship", content: "Connect converts to a Cell, enroll in Foundation School, check on them regularly, pray with them, help them grow.", duration: 15 }
      ],
      scriptures: ["Matthew 28:19-20", "Mark 16:15", "John 3:16", "Romans 3:23", "Romans 6:23", "Romans 10:9-10"],
      memoryVerse: "Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost. - Matthew 28:19",
      keyPoints: ["Soul winning includes discipleship", "The Great Commission is to make disciples", "Your testimony is powerful", "Follow-up is essential"],
      practicalExercises: ["Write your 3-minute testimony", "Identify 5 people to share with", "Learn the Romans Road", "Follow up with new converts"]
    },
    quiz: [
      { question: "What's the difference between soul saving and soul winning?", options: ["No difference", "Soul winning includes discipleship", "Soul saving is better", "Both unnecessary"], correctAnswer: 1, explanation: "Soul winning goes beyond leading to Christ - it includes discipleship." },
      { question: "What does Matthew 28:19-20 command?", options: ["Just preach", "Go and make disciples", "Stay in church", "Condemn sinners"], correctAnswer: 1, explanation: "We are commanded to go, teach, baptize, and make disciples." }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 4, isActive: true
  },
  {
    moduleNumber: 5, classWeek: 5, title: "Introduction to Cell Ministry",
    description: "Understanding the necessity and benefits of Cell Ministry",
    content: {
      introduction: "The Cell Ministry produces the results of Ephesians 4:11-16 - every member grows, matures, and supplies to the Church's growth.",
      learningObjective: "To introduce students to Cell Ministry and their responsibility to participate and contribute.",
      lessons: [
        { title: "What is a Cell?", content: "A Cell is the smallest structural unit capable of independent functioning. In Christ Embassy, a Cell has everything it needs but must stay connected to the mother Church.", duration: 20 },
        { title: "The Cell as a Missionary Unit", content: "Cells are for Soul winning and development. They encourage fellowship for nurturing faith. John 13:35 - 'By this shall all men know you are my disciples, if you have love.'", duration: 15 },
        { title: "Cell Ministry Structure", content: "Bible Study Class (3-12) → Cell (12-25) → Senior Cell (100+) → PCF (400+). Progression: Bible Study Teacher → Cell Leader → Senior Cell Leader → PCF Leader.", duration: 25 },
        { title: "Cell Meetings", content: "Four weekly meetings: 1st Week - Prayer/Planning, 2nd Week - Bible Study, 3rd Week - Bible Study, 4th Week - Outreach.", duration: 20 },
        { title: "Your Role in Cell Ministry", content: "Join a Cell, attend faithfully, participate in outreaches, invite others, and grow to become a Cell Leader. Cell Ministry is not optional!", duration: 15 }
      ],
      scriptures: ["Ephesians 4:11-16", "John 13:35", "Acts 2:42-47", "Hebrews 10:24-25", "Acts 5:42"],
      memoryVerse: "And daily in the temple, and in every house, they ceased not to teach and preach Jesus Christ. - Acts 5:42",
      keyPoints: ["Cell Ministry is a strategy of the Spirit", "Cells win, build, and send", "Cell Ministry is not optional", "Every member should participate and eventually lead"],
      practicalExercises: ["Join a Cell in your area", "Attend all four Cell meetings this month", "Invite someone to Cell", "Identify souls to win"]
    },
    quiz: [
      { question: "What's the minimum for a Bible Study Class?", options: ["1", "3", "12", "25"], correctAnswer: 1, explanation: "A Bible Study Class starts with a minimum of 3 members." },
      { question: "How many weekly Cell meetings?", options: ["One", "Two", "Four", "Seven"], correctAnswer: 2, explanation: "Four meetings: Prayer/Planning, Bible Study (x2), and Outreach." }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 5, isActive: true
  },
  {
    moduleNumber: 6, classWeek: 6, title: "Christian Character and Prosperity",
    description: "Developing Christ-like character and understanding biblical prosperity",
    content: {
      introduction: "The new creature can develop character consistent with their calling. While salvation is instantaneous, growth is progressive - from glory to glory.",
      learningObjective: "To set believers on a course of irreversible growth in Christian character and prosperity.",
      lessons: [
        { title: "God's Desire for Your Growth", content: "The Vision includes 'demonstrating the Character of the Spirit.' 1 Cor 6:17 - The Holy Spirit mingles with our spirit for one expression of character.", duration: 20 },
        { title: "The Fruit of the Spirit", content: "Galatians 5:22-23 - love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance. One fruit with nine expressions - Christ's character in you!", duration: 20 },
        { title: "Developing Character", content: "Through: Meditation on God's Word (Joshua 1:8), Practice, Being filled with the Spirit, Fellowship with mature believers.", duration: 20 },
        { title: "Biblical Prosperity", content: "3 John 1:2 - God wants you to prosper! Biblical prosperity includes spiritual, physical, financial, and relational abundance.", duration: 20 },
        { title: "Tithing and Giving", content: "Malachi 3:10-11 - Tithing is returning 10% to God. Beyond tithing, we give offerings and seeds. Giving positions you for supernatural increase.", duration: 15 }
      ],
      scriptures: ["Galatians 5:22-23", "2 Corinthians 3:18", "3 John 1:2", "Malachi 3:10-11", "2 Corinthians 9:6-8"],
      memoryVerse: "But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance. - Galatians 5:22-23",
      keyPoints: ["Character development is progressive", "Fruit of the Spirit is Christ's character in you", "God desires your prosperity", "Tithing positions you for increase"],
      practicalExercises: ["Identify one character area to develop", "Meditate on the fruit of the Spirit", "Begin faithful tithing", "Give a special seed offering"]
    },
    quiz: [
      { question: "How many expressions of the fruit?", options: ["Seven", "Nine", "Twelve", "Three"], correctAnswer: 1, explanation: "Nine expressions: love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance." },
      { question: "What does 3 John 1:2 say?", options: ["Prosperity is evil", "God wants you to prosper", "Only pastors prosper", "Prosperity is uncertain"], correctAnswer: 1, explanation: "God wishes above all things that you prosper!" }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 6, isActive: true
  },
  {
    moduleNumber: 7, classWeek: 7, title: "The Local Assembly and Loveworld Inc.",
    description: "The necessity of belonging to a Local Assembly and our Ministry's Vision",
    content: {
      introduction: "Understanding why you must belong to a Local Assembly and attend services consistently, plus our Ministry's Vision and Mission.",
      learningObjective: "To establish believers in local church membership and alignment with our Ministry's vision.",
      lessons: [
        { title: "The Universal Church", content: "Church (Ecclesia) means gathering of called-out people. The Universal Church is the entire Body of Christ in the earth.", duration: 15 },
        { title: "The Local Assembly", content: "Every Christian must be a member of a Local Assembly to be nurtured, grow, and function effectively. Structure is divinely ordained (Eph 4:11-16).", duration: 20 },
        { title: "Why Go to Church", content: "Your first responsibility is attending corporate services. Personal devotion cannot substitute for corporate gathering.", duration: 20 },
        { title: "Our Ministry Vision", content: "Vision: 'To take God's divine presence to the peoples and nations of the world, demonstrating the character of the Spirit.' Mission: 'To bring salvation to the lost, establish saints in faith, build the church.'", duration: 20 },
        { title: "Statement of Faith", content: "We believe in: Bible's inspiration, Trinity, Deity of Christ, Salvation by grace, Baptism of Holy Spirit, Second coming, Heaven and hell, Church as Christ's Body.", duration: 20 }
      ],
      scriptures: ["Ephesians 4:11-16", "Hebrews 10:25", "Acts 2:42-47", "Psalm 122:1"],
      memoryVerse: "Not forsaking the assembling of ourselves together, as the manner of some is. - Hebrews 10:25",
      keyPoints: ["Every Christian must belong to a local assembly", "Personal devotion can't replace corporate gathering", "Local church provides structure for growth", "Alignment with ministry vision is essential"],
      practicalExercises: ["Memorize the Ministry Vision", "Commit to attending all services", "Identify your role in the local assembly", "Share the vision with a new believer"]
    },
    quiz: [
      { question: "What does 'Ecclesia' mean?", options: ["Building", "Religion", "Gathering of called-out people", "Sunday meeting"], correctAnswer: 2, explanation: "Ecclesia means the gathering of called-out people." },
      { question: "Can personal devotion replace church attendance?", options: ["Yes", "Sometimes", "No", "It's better"], correctAnswer: 2, explanation: "Personal devotion cannot substitute for corporate gathering - both are needed." }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 7, isActive: true
  },
  {
    moduleNumber: 8, classWeek: 8, title: "Mobile Technology for Personal Growth",
    description: "Using Ministry technology platforms for evangelism and church growth",
    content: {
      introduction: "In Christ Embassy, Technology is primarily for the propagation of the Gospel. We are foremost users and creators of technology for the furtherance of the gospel.",
      learningObjective: "To ensure every member has sufficient knowledge of Ministry Technology Platforms and Apps for personal growth and evangelism.",
      lessons: [
        { title: "Technology for Ministry", content: "Technology is primarily for Gospel propagation. We are not just users but creators of technology for the furtherance of the gospel.", duration: 15 },
        { title: "Ministry Apps Overview", content: "Key apps: KingsChat (communication), Pastor Chris Digital Library (PCDL), Rhapsody of Realities app, LoveWorld News Network, and other ministry platforms.", duration: 25 },
        { title: "Technology for Evangelism", content: "Share ministry content on social media, use KingsChat for gospel conversations, share Rhapsody digitally, livestream services.", duration: 20 },
        { title: "Practical Session", content: "Download and setup ministry apps, learn navigation, practice sharing content, connect with believers on ministry platforms.", duration: 30 }
      ],
      scriptures: ["Mark 16:15", "Matthew 24:14", "Isaiah 52:7", "Romans 10:14-15"],
      memoryVerse: "How beautiful are the feet of him that bringeth good tidings, that publisheth peace. - Isaiah 52:7",
      keyPoints: ["Technology is for Gospel propagation", "Every member should be proficient in ministry technology", "Ministry apps are tools for growth and evangelism"],
      practicalExercises: ["Download all ministry apps", "Share Rhapsody with 5 people", "Join groups on KingsChat", "Livestream a service to an unsaved friend"]
    },
    quiz: [
      { question: "What is technology's primary purpose?", options: ["Entertainment", "Social media", "Propagation of the Gospel", "Business"], correctAnswer: 2, explanation: "Technology is primarily for the propagation of the Gospel!" },
      { question: "Which app is for ministry communication?", options: ["WhatsApp", "KingsChat", "Telegram", "Facebook"], correctAnswer: 1, explanation: "KingsChat is our ministry communication platform." }
    ],
    passingScore: 70, duration: 7, isRequired: true, order: 8, isActive: true
  }
];

async function seedFoundationModules() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    await FoundationModule.deleteMany({});
    console.log('🗑️ Cleared existing modules');
    
    for (const moduleData of foundationSchoolModules) {
      const module = new FoundationModule({ ...moduleData, createdAt: new Date() });
      await module.save();
      console.log(\`✅ Created Class \${module.classWeek}: \${module.title}\`);
    }
    
    console.log(\`\n🎉 Successfully seeded \${foundationSchoolModules.length} Foundation School classes!\`);
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

if (require.main === module) { seedFoundationModules(); }
module.exports = { seedFoundationModules, foundationSchoolModules };
