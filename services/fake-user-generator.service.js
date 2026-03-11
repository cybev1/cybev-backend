// ============================================
// FILE: services/fake-user-generator.service.js
// Synthetic User Generation Engine V3.0
// 131 Countries, Ethnic Matching, Diaspora
// Imports from data/world-countries-*.js
// ============================================

const crypto = require('crypto');
let COUNTRIES = {};

// Load country data
try {
  const { WORLD_COUNTRIES } = require('../data/world-countries-part1');
  const { WORLD_COUNTRIES_PART2 } = require('../data/world-countries-part2');
  const { WORLD_COUNTRIES_PART3 } = require('../data/world-countries-part3');
  COUNTRIES = { ...WORLD_COUNTRIES, ...WORLD_COUNTRIES_PART2, ...WORLD_COUNTRIES_PART3 };
  console.log(`✅ Loaded ${Object.keys(COUNTRIES).length} countries for user generation`);
} catch (e) {
  console.error('❌ Failed to load country data:', e.message);
}

// Diaspora config (8% chance to live abroad)
const DIASPORA_MAP = {
  Nigeria: [{dest:'United States',prob:0.03,cities:['Houston','New York City','Atlanta']},{dest:'United Kingdom',prob:0.04,cities:['London','Manchester']},{dest:'Canada',prob:0.01,cities:['Toronto','Calgary']},{dest:'South Africa',prob:0.005,cities:['Johannesburg']},{dest:'UAE',prob:0.005,cities:['Dubai']}],
  India: [{dest:'United States',prob:0.04,cities:['San Jose','New York City','Chicago','Seattle']},{dest:'United Kingdom',prob:0.03,cities:['London','Leicester','Birmingham']},{dest:'UAE',prob:0.03,cities:['Dubai','Abu Dhabi']},{dest:'Australia',prob:0.01,cities:['Sydney','Melbourne']}],
  Philippines: [{dest:'United States',prob:0.04,cities:['Los Angeles','San Francisco','Honolulu']},{dest:'UAE',prob:0.03,cities:['Dubai']},{dest:'Saudi Arabia',prob:0.02,cities:['Riyadh','Jeddah']}],
  Ghana: [{dest:'United States',prob:0.02,cities:['New York City','Chicago']},{dest:'United Kingdom',prob:0.03,cities:['London','Manchester']},{dest:'Germany',prob:0.01,cities:['Hamburg']}],
  Kenya: [{dest:'United States',prob:0.02,cities:['Dallas','Houston','Atlanta']},{dest:'United Kingdom',prob:0.02,cities:['London']}],
  Pakistan: [{dest:'United Kingdom',prob:0.04,cities:['London','Birmingham','Bradford']},{dest:'UAE',prob:0.03,cities:['Dubai','Sharjah']},{dest:'Saudi Arabia',prob:0.02,cities:['Riyadh']}],
  Bangladesh: [{dest:'United Kingdom',prob:0.03,cities:['London','Birmingham']},{dest:'UAE',prob:0.02,cities:['Dubai']},{dest:'Saudi Arabia',prob:0.02,cities:['Riyadh']}],
  'South Africa': [{dest:'United Kingdom',prob:0.03,cities:['London','Edinburgh']},{dest:'Australia',prob:0.02,cities:['Perth','Sydney']}],
  Brazil: [{dest:'United States',prob:0.03,cities:['Miami','Orlando','New York City']},{dest:'Japan',prob:0.01,cities:['Tokyo']}],
  China: [{dest:'United States',prob:0.02,cities:['San Francisco','New York City','Los Angeles']},{dest:'Australia',prob:0.01,cities:['Sydney','Melbourne']},{dest:'United Kingdom',prob:0.01,cities:['London']}],
  Egypt: [{dest:'UAE',prob:0.03,cities:['Dubai']},{dest:'Saudi Arabia',prob:0.02,cities:['Riyadh','Jeddah']}],
  Mexico: [{dest:'United States',prob:0.05,cities:['Los Angeles','Houston','Chicago','Dallas','San Antonio']}],
  Turkey: [{dest:'Germany',prob:0.03,cities:['Berlin','Cologne','Munich']},{dest:'United Kingdom',prob:0.01,cities:['London']}],
  Vietnam: [{dest:'United States',prob:0.02,cities:['San Jose','Houston']},{dest:'Australia',prob:0.01,cities:['Sydney','Melbourne']}],
  Colombia: [{dest:'United States',prob:0.03,cities:['Miami','New York City']},{dest:'Spain',prob:0.01,cities:['Madrid']}],
  Indonesia: [{dest:'Saudi Arabia',prob:0.01,cities:['Riyadh','Jeddah']},{dest:'Malaysia',prob:0.02,cities:['Kuala Lumpur']}],
};

const BIO_TEMPLATES = [
  "{occupation} based in {city}, {country}. {interest1} enthusiast.",
  "Living in {city} 🌍 | {occupation} | Love {interest1} & {interest2}",
  "{occupation} | {city}, {country} | Passionate about {interest1}",
  "🙏 Believer | {occupation} | {city} | {interest1} lover",
  "{interest1} | {interest2} | {interest3} | Based in {city}",
  "Just a {occupation} who loves {interest1} and {interest2} ✨",
  "{city} 📍 | {occupation} | Making the world better one day at a time",
  "Content creator from {city}. Journey in {interest1}.",
  "📚 {interest1} | 🎵 {interest2} | 💼 {occupation} | 📍 {city}",
  "Faith. Family. {interest1}. | {occupation} in {city}",
  "Building cool stuff | {city} | {interest1}",
  "{occupation} | {interest1} & {interest2} | {city}",
  "Dreamer. Doer. {occupation}. Living in {city}.",
  "God first 🙏 | {occupation} | {city}, {country}",
  "Representing {city} 🏠 | {occupation} | {interest1}",
];

const ABOUT_TEMPLATES = [
  "Passionate {occupation} based in {city}, {country}. When not working, exploring {interest1} or {interest2}. Believe in making a positive impact.",
  "From {city}, working as a {occupation}. Graduated from {school}. Passions: {interest1}, {interest2}, {interest3}.",
  "Born in {hometown}. Working as {occupation} in {city}. Deeply passionate about {interest1} and {interest2}.",
  "Professional {occupation} based in {city}. Always learning. Interests: {interest1}, {interest2}, {interest3}.",
];

const GENDERS = ['male','female'];
const REL_STATUSES = ['single','in_relationship','married','prefer_not_to_say',''];
const LANGUAGES = ['English','French','Spanish','Portuguese','Arabic','Mandarin','Hindi','Swahili','German','Japanese','Korean','Yoruba','Igbo','Hausa','Twi','Zulu','Tagalog','Indonesian','Vietnamese','Thai','Turkish','Russian','Bengali','Urdu','Persian','Italian','Dutch','Polish','Swedish','Greek','Czech','Hungarian','Romanian','Malay','Amharic','Somali','Burmese','Khmer','Nepali','Sinhala'];
const SKILLS = ['Writing','Photography','Video Editing','Public Speaking','Leadership','Music','Graphic Design','Social Media','Marketing','Coding','Teaching','Counseling','Event Planning','Web Development','Data Analysis','Project Management','Content Creation','Worship Leading','Singing','Dancing','Cooking','Sports Coaching'];

class FakeUserGenerator {
  constructor() {
    this.usedEmails = new Set();
    this.usedUsernames = new Set();
    this.weightedCountries = [];
    for (const [name, data] of Object.entries(COUNTRIES)) {
      for (let i = 0; i < (data.weight || 1); i++) this.weightedCountries.push(name);
    }
  }

  _pick(a){return a[Math.floor(Math.random()*a.length)]}
  _pickN(a,n){return[...a].sort(()=>Math.random()-0.5).slice(0,Math.min(n,a.length))}
  _rand(a,b){return Math.floor(Math.random()*(b-a+1))+a}

  _genUsername(f,l){
    const fl=f.toLowerCase().replace(/[^a-z0-9]/g,''),ll=l.toLowerCase().replace(/[^a-z0-9]/g,'');
    const p=[()=>`${fl}${ll}${this._rand(1,999)}`,()=>`${fl}_${ll}${this._rand(1,99)}`,()=>`${fl}.${ll}${this._rand(1,99)}`,()=>`${fl}${this._rand(100,9999)}`,()=>`${fl[0]}${ll}${this._rand(10,999)}`,()=>`${ll}${fl[0]}${this._rand(10,999)}`,()=>`${fl}${ll[0]}${this._rand(10,9999)}`];
    for(let i=0;i<50;i++){const u=this._pick(p)();if(!this.usedUsernames.has(u)){this.usedUsernames.add(u);return u}}
    const fb=`user${Date.now()}${this._rand(1,9999)}`;this.usedUsernames.add(fb);return fb;
  }

  _genEmail(f,l,d){
    const fl=f.toLowerCase().replace(/[^a-z0-9]/g,''),ll=l.toLowerCase().replace(/[^a-z0-9]/g,''),dom=this._pick(d);
    for(let i=0;i<50;i++){const e=`${fl}${this._pick(['','.','_'])}${ll}${this._rand(1,9999)}@${dom}`;if(!this.usedEmails.has(e)){this.usedEmails.add(e);return e}}
    return`${fl}${crypto.randomBytes(4).toString('hex')}@${this._pick(d)}`;
  }

  _genPhone(p,l){let d=''+this._rand(1,9);for(let i=1;i<l;i++)d+=this._rand(0,9);return`+${p}${d}`}
  _genDOB(){return new Date(this._rand(1975,2004),this._rand(0,11),this._rand(1,28))}
  _genCreatedAt(days=365){return new Date(Date.now()-this._rand(1,days)*86400000)}
  _genAvatar(name){const s=this._pick(['avataaars','personas','notionists','lorelei','micah','adventurer','big-ears']);return`https://api.dicebear.com/7.x/${s}/svg?seed=${encodeURIComponent(name+this._rand(1,99999))}`}
  _fill(t,v){return t.replace(/{(\w+)}/g,(_,k)=>v[k]||'')}

  generateUser(opts={}) {
    const originCountry = opts.country || this._pick(this.weightedCountries);
    const cd = COUNTRIES[originCountry];
    if(!cd) throw new Error(`Unknown country: ${originCountry}`);

    // Pick ethnic group
    const ew=[];cd.ethnicGroups.forEach(eg=>{for(let i=0;i<(eg.weight||1);i++)ew.push(eg)});
    const ethnic=this._pick(ew);
    const firstName=this._pick(ethnic.firstNames),lastName=this._pick(ethnic.lastNames);
    const fullName=`${firstName} ${lastName}`;

    // Diaspora check (8%)
    let country=originCountry,state,city,isDiaspora=false;
    const dias=DIASPORA_MAP[originCountry];
    if(dias&&Math.random()<0.08){
      let cum=0;const r=Math.random();
      for(const d of dias){cum+=d.prob;if(r<cum){
        country=d.dest;city=this._pick(d.cities);
        const dd=COUNTRIES[country];
        if(dd){for(const eg of dd.ethnicGroups){for(const rr of eg.regions){if(rr.cities.includes(city)){state=rr.state;break}}if(state)break}
        if(!state)state=dd.ethnicGroups[0]?.regions[0]?.state||''}
        isDiaspora=true;break;
      }}
    }
    if(!isDiaspora){const rg=this._pick(ethnic.regions);state=rg.state;city=this._pick(rg.cities)}

    const gender=this._pick(GENDERS),occ=this._pick(cd.occupations);
    const comp=Math.random()>0.35?this._pick(cd.companies):'';
    const school=this._pick(cd.schools),ints=this._pickN(cd.interests,this._rand(3,7));
    const hometown=isDiaspora?this._pick(ethnic.regions[0]?.cities||[city]):city;
    const hometownCountry=isDiaspora?originCountry:country;
    const createdAt=opts.createdAt||this._genCreatedAt(opts.daysBack||365);
    const v={city,country,occupation:occ,company:comp,school,hometown,interest1:ints[0]||'Music',interest2:ints[1]||'Travel',interest3:ints[2]||'Food'};

    return {
      name:fullName,email:this._genEmail(firstName,lastName,cd.emailDomains),
      username:this._genUsername(firstName,lastName),
      password:'$2a$10$dummyHashedPasswordForSyntheticUsersOnly000000000000',
      bio:this._fill(this._pick(BIO_TEMPLATES),v),
      avatar:this._genAvatar(fullName),
      coverImage:`https://api.dicebear.com/7.x/shapes/svg?seed=${this._rand(1,99999)}`,
      location:`${city}, ${country}`,
      locationData:{providedCountry:country,providedCity:city,providedLocation:`${city}, ${state}, ${country}`,detectedCountry:country,detectedCity:city,detectedRegion:state,locationType:'verified',locationMatches:true},
      personalInfo:{
        firstName,lastName,dateOfBirth:this._genDOB(),gender,
        phone:this._genPhone(cd.phonePrefix,cd.phoneLen),
        currentCity:city,currentCountry:country,hometown,hometownCountry,
        occupation:occ,company:comp,jobTitle:occ,education:school,school,
        graduationYear:this._rand(2000,2024),
        relationshipStatus:this._pick(REL_STATUSES),
        interests:ints,skills:this._pickN(SKILLS,this._rand(2,5)),
        languages:this._pickN(LANGUAGES,this._rand(1,3)),
        aboutMe:this._fill(this._pick(ABOUT_TEMPLATES),v),
        religion:Math.random()>0.3?'Christianity':'',
        favoriteQuote:'',
        visibility:{dateOfBirth:'friends',phone:'only_me',email:'friends',location:'public',relationshipStatus:'friends',workplace:'public'}
      },
      followerCount:this._rand(5,500),followingCount:this._rand(10,300),followersCount:0,
      hasCompletedOnboarding:true,
      onboardingData:{fullName,role:this._pick(['creator','viewer','ministry','business']),goals:this._pickN(['grow_audience','create_content','connect','monetize','ministry'],2),experience:this._pick(['beginner','intermediate','experienced']),completedAt:createdAt},
      preferences:{emailNotifications:Math.random()>0.3,pushNotifications:Math.random()>0.2,newsletterSubscription:Math.random()>0.5,theme:this._pick(['light','dark','system']),language:'en'},
      isVerified:Math.random()>0.7,isAdmin:false,role:Math.random()>0.7?'creator':'user',status:'active',
      isEmailVerified:true,linkedProviders:['email'],
      isSynthetic:true,
      syntheticMeta:{generatedAt:new Date(),batchId:opts.batchId||null,sourceCountry:originCountry,ethnicGroup:ethnic.name,isDiaspora,livingIn:country,version:'3.0'},
      createdAt,updatedAt:createdAt,lastLogin:new Date(createdAt.getTime()+this._rand(1,30)*86400000),
    };
  }

  generateBatch(count,opts={}){
    const batchId=opts.batchId||`batch_${Date.now()}`;
    return Array.from({length:count},()=>this.generateUser({...opts,batchId}));
  }
}

module.exports = { FakeUserGenerator, COUNTRIES };
