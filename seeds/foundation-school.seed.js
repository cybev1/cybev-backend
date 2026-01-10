// ============================================
// FILE: seeds/foundation-school.seed.js
// Default Foundation School Modules
// Run with: node seeds/foundation-school.seed.js
// ============================================

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cybev';

const FoundationModuleSchema = new mongoose.Schema({
  title: String,
  description: String,
  moduleNumber: Number,
  content: {
    introduction: String,
    lessons: [{
      title: String,
      content: String,
      videoUrl: String,
      audioUrl: String,
      duration: Number,
      resources: [{ title: String, type: String, url: String }]
    }],
    scriptures: [String],
    memoryVerse: String
  },
  quiz: [{
    question: String,
    options: [String],
    correctAnswer: Number,
    explanation: String
  }],
  passingScore: Number,
  duration: Number,
  isRequired: Boolean,
  order: Number,
  isActive: Boolean,
  createdAt: Date
});

const FoundationModule = mongoose.model('FoundationModule', FoundationModuleSchema);

const defaultModules = [
  {
    moduleNumber: 1,
    title: "Salvation & New Birth",
    description: "Understanding the gift of salvation and what it means to be born again",
    content: {
      introduction: "Congratulations on receiving Jesus Christ as your Lord and Savior! This is the most important decision you will ever make. In this module, you will learn about what happened when you gave your life to Christ and understand the foundation of your new life in Him.",
      lessons: [
        {
          title: "What is Salvation?",
          content: "Salvation is God's gift to humanity through Jesus Christ. When you confessed Jesus as Lord and believed in your heart that God raised Him from the dead, you were saved (Romans 10:9-10). This means you have been delivered from the power of sin and death, and transferred into the Kingdom of God's dear Son.",
          duration: 15
        },
        {
          title: "The New Creation",
          content: "2 Corinthians 5:17 declares that if anyone is in Christ, they are a new creation. Old things have passed away; all things have become new. You are not the same person you were before. Your spirit has been recreated and made alive to God.",
          duration: 15
        },
        {
          title: "Your New Identity",
          content: "You are now a child of God (John 1:12), an heir of God and joint-heir with Christ (Romans 8:17). You have been blessed with every spiritual blessing in heavenly places in Christ (Ephesians 1:3). This is your new identity!",
          duration: 15
        }
      ],
      scriptures: ["Romans 10:9-10", "2 Corinthians 5:17", "John 1:12", "Romans 8:17", "Ephesians 1:3", "John 3:16"],
      memoryVerse: "Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new. - 2 Corinthians 5:17"
    },
    quiz: [
      {
        question: "What happens when you confess Jesus as Lord and believe in your heart?",
        options: ["You become a good person", "You are saved", "You become religious", "Nothing happens"],
        correctAnswer: 1,
        explanation: "Romans 10:9-10 says if you confess with your mouth Jesus as Lord and believe in your heart that God raised Him from the dead, you shall be saved."
      },
      {
        question: "According to 2 Corinthians 5:17, what happens when someone is in Christ?",
        options: ["They try to be better", "They become a new creation", "They join a church", "They follow rules"],
        correctAnswer: 1,
        explanation: "The Bible says we become a new creation - old things pass away and all things become new!"
      },
      {
        question: "What is your new identity in Christ?",
        options: ["A sinner saved by grace", "A child of God and heir with Christ", "A church member", "A religious person"],
        correctAnswer: 1,
        explanation: "John 1:12 says we are children of God, and Romans 8:17 says we are heirs of God and joint-heirs with Christ."
      }
    ],
    passingScore: 70,
    duration: 7,
    isRequired: true,
    order: 1,
    isActive: true
  },
  {
    moduleNumber: 2,
    title: "The Word of God",
    description: "Understanding the importance of God's Word in your new life",
    content: {
      introduction: "The Word of God is the foundation of your Christian life. It is through the Word that you grow, receive faith, and understand God's will for your life. In this module, you will learn how to study and apply God's Word effectively.",
      lessons: [
        {
          title: "The Power of God's Word",
          content: "Hebrews 4:12 tells us that the Word of God is living and powerful. It's not just a book - it's God speaking to you today. When you read and meditate on the Word, you're receiving life, direction, and strength.",
          duration: 15
        },
        {
          title: "Faith Comes by Hearing",
          content: "Romans 10:17 says faith comes by hearing, and hearing by the Word of God. As you consistently hear and study the Word, your faith grows stronger. This faith is what you need to receive all that God has for you.",
          duration: 15
        },
        {
          title: "Meditating on the Word",
          content: "Joshua 1:8 instructs us to meditate on God's Word day and night. This means to think about it, speak it, and apply it to your life. As you do this, you will be prosperous and successful in all your ways.",
          duration: 15
        }
      ],
      scriptures: ["Hebrews 4:12", "Romans 10:17", "Joshua 1:8", "2 Timothy 3:16-17", "Psalm 119:105"],
      memoryVerse: "This book of the law shall not depart out of thy mouth; but thou shalt meditate therein day and night, that thou mayest observe to do according to all that is written therein: for then thou shalt make thy way prosperous, and then thou shalt have good success. - Joshua 1:8"
    },
    quiz: [
      {
        question: "According to Hebrews 4:12, what is God's Word?",
        options: ["An old book", "Living and powerful", "Just history", "Optional reading"],
        correctAnswer: 1,
        explanation: "The Word of God is living and powerful, sharper than any two-edged sword!"
      },
      {
        question: "How does faith come according to Romans 10:17?",
        options: ["By hoping", "By hearing the Word of God", "By attending church", "By doing good works"],
        correctAnswer: 1,
        explanation: "Faith comes by hearing, and hearing by the Word of God."
      },
      {
        question: "What is the result of meditating on God's Word day and night?",
        options: ["Nothing special", "You become religious", "You become prosperous and successful", "You become boring"],
        correctAnswer: 2,
        explanation: "Joshua 1:8 promises prosperity and success to those who meditate on God's Word!"
      }
    ],
    passingScore: 70,
    duration: 7,
    isRequired: true,
    order: 2,
    isActive: true
  },
  {
    moduleNumber: 3,
    title: "Prayer & Fellowship with God",
    description: "Learning to communicate with God through prayer",
    content: {
      introduction: "Prayer is your direct line of communication with God your Father. It's not a religious ritual but a relationship. In this module, you will learn how to pray effectively and enjoy fellowship with God.",
      lessons: [
        {
          title: "What is Prayer?",
          content: "Prayer is simply talking to God. As His child, you have direct access to Him through Jesus Christ (Hebrews 4:16). You can come boldly to His throne of grace and share everything with Him - your joys, concerns, and needs.",
          duration: 15
        },
        {
          title: "How to Pray Effectively",
          content: "Jesus taught us to pray in John 16:23-24 - asking the Father in Jesus' name. When you pray according to God's Word and in Jesus' name, you can be confident that God hears and answers your prayers.",
          duration: 15
        },
        {
          title: "The Prayer of Faith",
          content: "Mark 11:24 teaches that whatever things you desire when you pray, believe that you receive them and you shall have them. This is the prayer of faith - praying and believing that you receive what you've asked for.",
          duration: 15
        }
      ],
      scriptures: ["Hebrews 4:16", "John 16:23-24", "Mark 11:24", "1 Thessalonians 5:17", "Philippians 4:6"],
      memoryVerse: "Therefore I say unto you, What things soever ye desire, when ye pray, believe that ye receive them, and ye shall have them. - Mark 11:24"
    },
    quiz: [
      {
        question: "What kind of access do we have to God in prayer?",
        options: ["Limited access", "No access", "Bold access through Jesus", "Uncertain access"],
        correctAnswer: 2,
        explanation: "Hebrews 4:16 says we can come boldly to God's throne of grace!"
      },
      {
        question: "In whose name should we pray to the Father?",
        options: ["In our own name", "In the name of angels", "In Jesus' name", "In any name"],
        correctAnswer: 2,
        explanation: "Jesus taught us to ask the Father in His name (John 16:23-24)."
      },
      {
        question: "What is the key to the prayer of faith?",
        options: ["Pray loudly", "Pray with doubt", "Believe you receive when you pray", "Pray many times"],
        correctAnswer: 2,
        explanation: "Mark 11:24 teaches us to believe we receive when we pray!"
      }
    ],
    passingScore: 70,
    duration: 7,
    isRequired: true,
    order: 3,
    isActive: true
  },
  {
    moduleNumber: 4,
    title: "The Holy Spirit",
    description: "Understanding and receiving the Holy Spirit",
    content: {
      introduction: "The Holy Spirit is God living in you! When you received Christ, the Holy Spirit came to dwell in your spirit. In this module, you will learn about who the Holy Spirit is and how to fellowship with Him.",
      lessons: [
        {
          title: "Who is the Holy Spirit?",
          content: "The Holy Spirit is the third Person of the Godhead. He is not just a force or influence - He is God! Jesus called Him the Comforter, the Spirit of Truth who would guide us into all truth (John 14:16-17, 16:13).",
          duration: 15
        },
        {
          title: "The Holy Spirit Lives in You",
          content: "1 Corinthians 6:19 says your body is the temple of the Holy Spirit. He lives in you to help you, guide you, teach you, and empower you for service. You are never alone!",
          duration: 15
        },
        {
          title: "The Baptism of the Holy Spirit",
          content: "Jesus promised that believers would receive power when the Holy Spirit comes upon them (Acts 1:8). This baptism of the Holy Spirit is available to every believer and comes with the evidence of speaking in other tongues.",
          duration: 15
        }
      ],
      scriptures: ["John 14:16-17", "John 16:13", "1 Corinthians 6:19", "Acts 1:8", "Acts 2:4"],
      memoryVerse: "But ye shall receive power, after that the Holy Ghost is come upon you: and ye shall be witnesses unto me both in Jerusalem, and in all Judaea, and in Samaria, and unto the uttermost part of the earth. - Acts 1:8"
    },
    quiz: [
      {
        question: "Who is the Holy Spirit?",
        options: ["A force", "An influence", "The third Person of the Godhead", "A feeling"],
        correctAnswer: 2,
        explanation: "The Holy Spirit is God - the third Person of the Trinity!"
      },
      {
        question: "Where does the Holy Spirit live?",
        options: ["In heaven only", "In the church building", "In every believer", "Nowhere"],
        correctAnswer: 2,
        explanation: "1 Corinthians 6:19 says our body is the temple of the Holy Spirit!"
      },
      {
        question: "What did Jesus promise believers would receive with the Holy Spirit?",
        options: ["Wealth", "Power", "Problems", "Nothing"],
        correctAnswer: 1,
        explanation: "Acts 1:8 promises power when the Holy Spirit comes upon us!"
      }
    ],
    passingScore: 70,
    duration: 7,
    isRequired: true,
    order: 4,
    isActive: true
  },
  {
    moduleNumber: 5,
    title: "The Local Church",
    description: "Understanding the importance of church fellowship",
    content: {
      introduction: "God never intended for you to live the Christian life alone. He has placed you in a family - the local church. In this module, you will learn about the importance of being part of a local church.",
      lessons: [
        {
          title: "The Body of Christ",
          content: "1 Corinthians 12:27 says we are the body of Christ, and members individually. Every believer is part of this body and has a role to play. The local church is the expression of this body in your community.",
          duration: 15
        },
        {
          title: "Why Church Fellowship Matters",
          content: "Hebrews 10:25 instructs us not to forsake the assembling of ourselves together. In church, you receive teaching, encouragement, accountability, and opportunities to serve. You also give strength to others.",
          duration: 15
        },
        {
          title: "Finding Your Place",
          content: "Every member has gifts and talents to contribute (Romans 12:4-8). As you become active in your local church, you will discover your unique role and how God wants to use you to bless others.",
          duration: 15
        }
      ],
      scriptures: ["1 Corinthians 12:27", "Hebrews 10:25", "Romans 12:4-8", "Ephesians 4:11-16", "Acts 2:42-47"],
      memoryVerse: "Not forsaking the assembling of ourselves together, as the manner of some is; but exhorting one another: and so much the more, as ye see the day approaching. - Hebrews 10:25"
    },
    quiz: [
      {
        question: "What does 1 Corinthians 12:27 call believers?",
        options: ["Strangers", "The body of Christ", "Spectators", "Visitors"],
        correctAnswer: 1,
        explanation: "We are the body of Christ, each one a vital member!"
      },
      {
        question: "What does Hebrews 10:25 tell us NOT to do?",
        options: ["Read the Bible", "Pray", "Forsake assembling together", "Worship God"],
        correctAnswer: 2,
        explanation: "We should not forsake gathering together with other believers!"
      },
      {
        question: "Why is finding your place in church important?",
        options: ["To be famous", "To use your gifts to bless others", "To be entertained", "It's not important"],
        correctAnswer: 1,
        explanation: "God has given each of us gifts to contribute to the body of Christ!"
      }
    ],
    passingScore: 70,
    duration: 7,
    isRequired: true,
    order: 5,
    isActive: true
  },
  {
    moduleNumber: 6,
    title: "Living the Christian Life",
    description: "Practical guidance for daily Christian living",
    content: {
      introduction: "Being a Christian is not just about going to church - it's about living a transformed life every day. In this final module, you will learn practical principles for living victoriously as a child of God.",
      lessons: [
        {
          title: "Walking in Love",
          content: "John 13:35 says people will know we are Christ's disciples by our love for one another. Love is the distinguishing mark of a Christian. As you walk in love, you fulfill God's law and become a blessing to others.",
          duration: 15
        },
        {
          title: "Sharing Your Faith",
          content: "You have received the greatest gift - eternal life through Jesus Christ. God wants to use you to share this gift with others. Mark 16:15 commands us to go into all the world and preach the Gospel.",
          duration: 15
        },
        {
          title: "Growing and Moving Forward",
          content: "2 Peter 3:18 encourages us to grow in grace and in the knowledge of our Lord Jesus Christ. Your Christian journey is one of continuous growth. Keep studying the Word, praying, fellowshipping, and serving!",
          duration: 15
        }
      ],
      scriptures: ["John 13:35", "Mark 16:15", "2 Peter 3:18", "Galatians 5:22-23", "Philippians 3:13-14"],
      memoryVerse: "But grow in grace, and in the knowledge of our Lord and Saviour Jesus Christ. To him be glory both now and for ever. Amen. - 2 Peter 3:18"
    },
    quiz: [
      {
        question: "How will people know we are Jesus' disciples?",
        options: ["By our wealth", "By our education", "By our love for one another", "By our church attendance"],
        correctAnswer: 2,
        explanation: "John 13:35 says our love identifies us as Christ's disciples!"
      },
      {
        question: "What does Mark 16:15 command us to do?",
        options: ["Stay hidden", "Keep the Gospel to ourselves", "Go and preach the Gospel", "Only pray"],
        correctAnswer: 2,
        explanation: "We are commanded to share the Good News with the world!"
      },
      {
        question: "What should characterize our Christian life according to 2 Peter 3:18?",
        options: ["Stagnation", "Continuous growth", "Decline", "Staying the same"],
        correctAnswer: 1,
        explanation: "We should continually grow in grace and knowledge of Jesus Christ!"
      }
    ],
    passingScore: 70,
    duration: 7,
    isRequired: true,
    order: 6,
    isActive: true
  }
];

async function seedFoundationModules() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Clear existing modules
    await FoundationModule.deleteMany({});
    console.log('🗑️ Cleared existing modules');
    
    // Insert new modules
    for (const moduleData of defaultModules) {
      const module = new FoundationModule({
        ...moduleData,
        createdAt: new Date()
      });
      await module.save();
      console.log(`✅ Created Module ${module.moduleNumber}: ${module.title}`);
    }
    
    console.log(`\n🎉 Successfully seeded ${defaultModules.length} Foundation School modules!`);
    
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedFoundationModules();
}

module.exports = { seedFoundationModules, defaultModules };
