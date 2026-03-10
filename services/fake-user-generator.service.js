// ============================================
// FILE: services/fake-user-generator.service.js
// Synthetic User Generation Engine for CYBEV
// VERSION: 1.0
// Creates realistic users with culturally-accurate
// names, locations, bios, avatars, and personal info
// ============================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ==========================================
// COUNTRY DATA (Condensed from Herald DB)
// ==========================================
const COUNTRIES = {
  Nigeria: {
    firstNames: ['Adebayo','Chinonso','Emeka','Funmilayo','Ngozi','Oluwaseun','Chidinma','Tunde','Aisha','Obinna','Yetunde','Ifeanyi','Folake','Chukwuemeka','Blessing','Oluwatobi','Amara','Damilola','Kelechi','Bukola','Ifeoma','Segun','Nkechi','Adaeze','Olumide','Temitope','Nneka','Chidi','Abiodun','Chiamaka'],
    lastNames: ['Okafor','Adeyemi','Nwachukwu','Ibrahim','Okonkwo','Adeniyi','Eze','Balogun','Okoro','Abubakar','Ogundele','Nnamdi','Adeola','Chukwu','Obi','Bakare','Nwosu','Ayodeji','Udeh','Lawal'],
    cities: ['Lagos','Abuja','Port Harcourt','Ibadan','Kano','Enugu','Benin City','Warri','Owerri','Calabar','Kaduna','Jos','Abeokuta','Uyo','Asaba','Aba','Ilorin','Onitsha','Maiduguri','Sokoto'],
    states: ['Lagos','FCT','Rivers','Oyo','Kano','Enugu','Edo','Delta','Imo','Cross River','Kaduna','Plateau','Ogun','Akwa Ibom','Anambra','Abia','Kwara','Borno','Sokoto','Bayelsa'],
    phonePrefix: '234', phonLen: 10, weight: 9,
    occupations: ['Software Engineer','Pastor','Teacher','Business Owner','Doctor','Nurse','Banker','Accountant','Lawyer','Journalist','Civil Servant','Trader','Farmer','Musician','Fashion Designer'],
    companies: ['GTBank','Dangote Group','MTN Nigeria','Zenith Bank','Total Nigeria','Flutterwave','Andela','Access Bank','First Bank','Interswitch'],
    schools: ['University of Lagos','University of Ibadan','Covenant University','Obafemi Awolowo University','University of Nigeria Nsukka','Babcock University','Ahmadu Bello University','University of Benin'],
    interests: ['Gospel Music','Afrobeats','Football','Nollywood','Tech','Fashion','Cooking','Church','Business','Ministry','Photography','Dance','Comedy','Writing','Reading'],
    emailDomains: ['gmail.com','yahoo.com','outlook.com','hotmail.com']
  },
  Ghana: {
    firstNames: ['Kwame','Ama','Kofi','Akua','Kwasi','Abena','Yaw','Afua','Kwadwo','Adwoa','Nana','Akosua','Esi','Kojo','Efua','Adjoa','Fiifi','Maame','Papa','Serwaa','Afia','Bright','Mercy','Emmanuel','Grace'],
    lastNames: ['Mensah','Asante','Osei','Boateng','Amoah','Owusu','Adjei','Appiah','Darko','Agyeman','Frimpong','Bonsu','Amponsah','Gyasi','Ofori','Ansah','Badu','Sarpong'],
    cities: ['Accra','Kumasi','Tamale','Takoradi','Cape Coast','Koforidua','Sunyani','Ho','Wa','Bolgatanga','Tema','Teshie','Madina','Obuasi','Nkawkaw'],
    states: ['Greater Accra','Ashanti','Northern','Western','Central','Eastern','Brong-Ahafo','Volta','Upper East','Upper West'],
    phonePrefix: '233', phonLen: 9, weight: 5,
    occupations: ['Teacher','Trader','Nurse','Software Developer','Banker','Pastor','Civil Servant','Farmer','Engineer','Journalist'],
    companies: ['MTN Ghana','Vodafone Ghana','Ecobank','GCB Bank','Tullow Oil','Stanbic Bank','AirtelTigo'],
    schools: ['University of Ghana','KNUST','University of Cape Coast','Ashesi University','Ghana Institute of Management'],
    interests: ['Highlife Music','Football','Church','Cooking','Fashion','Tech','Ministry','Dance','Business','Reading'],
    emailDomains: ['gmail.com','yahoo.com','outlook.com']
  },
  'South Africa': {
    firstNames: ['Thabo','Nomsa','Sipho','Zanele','Mandla','Lerato','Bongani','Naledi','Tshepo','Lindiwe','Kagiso','Thandiwe','Sibusiso','Ayanda','Mpho','Nandi','Jabu','Palesa','Vusi','Nompilo'],
    lastNames: ['Nkosi','Dlamini','Zulu','Ndaba','Mthembu','Mokoena','Khumalo','Ngcobo','Cele','Maharaj','Pillay','Van der Merwe','Botha','Pretorius','Molefe','Maseko'],
    cities: ['Johannesburg','Cape Town','Durban','Pretoria','Port Elizabeth','Bloemfontein','Soweto','Pietermaritzburg','Polokwane','Rustenburg','Nelspruit','Kimberley','East London'],
    states: ['Gauteng','Western Cape','KwaZulu-Natal','Eastern Cape','Free State','Limpopo','Mpumalanga','North West','Northern Cape'],
    phonePrefix: '27', phonLen: 9, weight: 5,
    occupations: ['Accountant','Teacher','Nurse','Engineer','IT Specialist','Marketing Manager','Business Analyst','Doctor','Lawyer','Pastor'],
    companies: ['Sasol','MTN','Vodacom','Standard Bank','FNB','Discovery','Shoprite','Capitec','Old Mutual'],
    schools: ['University of Cape Town','Wits University','Stellenbosch University','University of Pretoria','University of KwaZulu-Natal'],
    interests: ['Rugby','Cricket','Gospel Music','Braai','Fashion','Tech','Church','Football','Photography','Hiking','Travel'],
    emailDomains: ['gmail.com','yahoo.com','outlook.co.za','icloud.com']
  },
  'United States': {
    firstNames: ['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Christopher','Karen','Daniel','Ashley','Matthew','Emily','Anthony','Megan','Mark','Samantha','Donald','Lauren'],
    lastNames: ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Wilson','Anderson','Taylor','Thomas','Moore','Jackson','Martin','Lee','Thompson','White'],
    cities: ['New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego','Dallas','Austin','San Jose','Seattle','Denver','Nashville','Portland','Atlanta','Miami','Boston','Detroit','Minneapolis'],
    states: ['California','Texas','Florida','New York','Illinois','Pennsylvania','Ohio','Georgia','North Carolina','Michigan','New Jersey','Virginia','Washington','Arizona','Massachusetts','Tennessee','Indiana','Missouri','Maryland','Colorado'],
    phonePrefix: '1', phonLen: 10, weight: 5,
    occupations: ['Software Engineer','Marketing Manager','Teacher','Nurse','Data Analyst','Product Manager','Designer','Writer','Sales Rep','Consultant','Pastor','Entrepreneur','Doctor','Lawyer','Financial Advisor'],
    companies: ['Google','Apple','Amazon','Microsoft','Meta','Netflix','Tesla','Walmart','JPMorgan','Goldman Sachs','Salesforce','Uber','Airbnb'],
    schools: ['MIT','Stanford','Harvard','UC Berkeley','University of Michigan','UT Austin','UCLA','Columbia University','NYU','Georgia Tech'],
    interests: ['Tech','Sports','Music','Travel','Fitness','Gaming','Photography','Cooking','Reading','Movies','Church','Podcasts','Hiking','Yoga','Art'],
    emailDomains: ['gmail.com','yahoo.com','outlook.com','icloud.com','hotmail.com']
  },
  'United Kingdom': {
    firstNames: ['Oliver','Amelia','Harry','Isla','George','Ava','Noah','Mia','Jack','Emily','Leo','Sophie','Oscar','Grace','Charlie','Lily','Freddie','Chloe','Alfie','Ella','Thomas','Charlotte','James','Daisy'],
    lastNames: ['Smith','Jones','Williams','Taylor','Brown','Davies','Evans','Wilson','Thomas','Roberts','Johnson','Lewis','Walker','Robinson','Wood','Thompson','White','Watson','Jackson','Wright'],
    cities: ['London','Manchester','Birmingham','Leeds','Glasgow','Liverpool','Edinburgh','Bristol','Sheffield','Cardiff','Newcastle','Nottingham','Belfast','Leicester','Brighton','Oxford','Cambridge'],
    states: ['England','Scotland','Wales','Northern Ireland','Greater London','West Midlands','Greater Manchester','West Yorkshire','South Yorkshire','Merseyside'],
    phonePrefix: '44', phonLen: 10, weight: 4,
    occupations: ['Software Developer','Marketing Executive','Teacher','Nurse','Accountant','Consultant','Designer','Writer','Data Analyst','Project Manager','Pastor','Entrepreneur'],
    companies: ['HSBC','Barclays','BBC','Tesco','BP','Unilever','GlaxoSmithKline','Rolls-Royce','Vodafone','BT Group'],
    schools: ['University of Oxford','University of Cambridge','Imperial College London','UCL','Kings College London','University of Edinburgh','University of Manchester'],
    interests: ['Football','Tea','Travel','Pub Culture','Music','Theatre','Reading','Cooking','Gardening','Cycling','Church','Photography','History'],
    emailDomains: ['gmail.com','yahoo.co.uk','outlook.com','btinternet.com','hotmail.co.uk']
  },
  India: {
    firstNames: ['Aarav','Priya','Arjun','Ananya','Vihaan','Diya','Aditya','Isha','Krishna','Kavya','Rohan','Sneha','Raj','Pooja','Amit','Neha','Vikram','Meera','Rahul','Divya','Sanjay','Lakshmi','Deepak','Anjali','Ravi','Nisha'],
    lastNames: ['Sharma','Patel','Singh','Kumar','Gupta','Shah','Joshi','Reddy','Nair','Pillai','Mehta','Chopra','Malhotra','Iyer','Bhat','Desai','Rao','Verma','Mishra','Das'],
    cities: ['Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Kolkata','Pune','Ahmedabad','Jaipur','Lucknow','Surat','Kochi','Chandigarh','Indore','Bhopal','Coimbatore','Thiruvananthapuram','Gurgaon','Noida'],
    states: ['Maharashtra','Delhi','Karnataka','Telangana','Tamil Nadu','West Bengal','Gujarat','Rajasthan','Uttar Pradesh','Kerala','Punjab','Madhya Pradesh','Andhra Pradesh','Haryana','Bihar'],
    phonePrefix: '91', phonLen: 10, weight: 5,
    occupations: ['Software Engineer','Doctor','Teacher','Accountant','Business Owner','Engineer','Data Scientist','Marketing Manager','Civil Servant','Pharmacist','IT Consultant','Pastor','Nurse'],
    companies: ['TCS','Infosys','Wipro','Reliance','HDFC Bank','ICICI Bank','Tata Motors','Flipkart','Zomato','Paytm','HCL Technologies'],
    schools: ['IIT Bombay','IIT Delhi','IIM Ahmedabad','BITS Pilani','Delhi University','Anna University','University of Mumbai','Jawaharlal Nehru University'],
    interests: ['Cricket','Bollywood','Tech','Cooking','Yoga','Music','Travel','Photography','Church','Dance','Reading','Spirituality','Business','Fashion'],
    emailDomains: ['gmail.com','yahoo.co.in','outlook.com','rediffmail.com','hotmail.com']
  },
  Kenya: {
    firstNames: ['Brian','Faith','Dennis','Mercy','Kevin','Grace','Peter','Joy','James','Hope','John','Charity','David','Esther','Samuel','Ruth','Daniel','Sarah','Moses','Naomi','Joseph','Wanjiku','Stephen','Akinyi'],
    lastNames: ['Kamau','Odhiambo','Mwangi','Kipchoge','Njoroge','Otieno','Wanjiku','Kimani','Ouma','Kiprotich','Mutua','Wambui','Kariuki','Achieng','Kiptoo','Nyambura','Koech','Maina'],
    cities: ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Malindi','Nyeri','Machakos','Kitale','Garissa','Kakamega','Nanyuki','Naivasha','Kericho'],
    states: ['Nairobi','Coast','Nyanza','Rift Valley','Central','Western','Eastern','North Eastern'],
    phonePrefix: '254', phonLen: 9, weight: 4,
    occupations: ['Teacher','Software Developer','Nurse','Banker','Farmer','Pastor','Business Owner','Engineer','Journalist','Accountant'],
    companies: ['Safaricom','KCB Bank','Equity Bank','Kenya Airways','East African Breweries','M-PESA'],
    schools: ['University of Nairobi','Kenyatta University','Strathmore University','JKUAT','Moi University'],
    interests: ['Athletics','Football','Safari','Music','Church','Tech','Business','Cooking','Travel','Photography','Ministry'],
    emailDomains: ['gmail.com','yahoo.com','outlook.com']
  },
  Brazil: {
    firstNames: ['Lucas','Ana','Gabriel','Maria','Mateus','Julia','Rafael','Beatriz','Gustavo','Larissa','Pedro','Fernanda','Felipe','Camila','Bruno','Isabela','Diego','Leticia','Thiago','Amanda'],
    lastNames: ['Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Costa','Pereira','Carvalho','Gomes','Martins','Araujo','Ribeiro','Almeida','Nascimento','Lima','Barbosa','Rocha'],
    cities: ['São Paulo','Rio de Janeiro','Brasília','Salvador','Fortaleza','Belo Horizonte','Manaus','Curitiba','Recife','Porto Alegre','Goiânia','Belém','Campinas','Florianópolis','Natal'],
    states: ['São Paulo','Rio de Janeiro','Minas Gerais','Bahia','Ceará','Paraná','Pernambuco','Rio Grande do Sul','Goiás','Pará','Amazonas','Santa Catarina','Distrito Federal'],
    phonePrefix: '55', phonLen: 11, weight: 3,
    occupations: ['Engineer','Teacher','Business Owner','Developer','Doctor','Nurse','Accountant','Marketing','Pastor','Designer'],
    companies: ['Petrobras','Itaú','Bradesco','Banco do Brasil','Vale','Ambev','Natura','Magazine Luiza','Nubank'],
    schools: ['USP','UNICAMP','UFRJ','PUC','FGV','UFMG','UFRGS'],
    interests: ['Football','Samba','Beach','Carnival','Music','Church','BBQ','Dance','Surfing','Travel','Photography','Fitness'],
    emailDomains: ['gmail.com','yahoo.com.br','outlook.com','hotmail.com','uol.com.br']
  }
};

// Add more countries (condensed)
const MORE_COUNTRIES = {
  Germany: { firstNames:['Max','Sophie','Leon','Emma','Lukas','Mia','Paul','Hannah','Felix','Lena','Jonas','Laura','Tim','Sarah','David','Lisa'], lastNames:['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Hoffmann','Koch'], cities:['Berlin','Munich','Hamburg','Frankfurt','Cologne','Stuttgart','Düsseldorf','Dresden','Leipzig','Hannover'], states:['Bavaria','Berlin','NRW','Baden-Württemberg','Hesse','Saxony','Lower Saxony'], phonePrefix:'49', phonLen:11, weight:2, occupations:['Engineer','Developer','Teacher','Doctor','Researcher','Manager','Designer','Consultant'], companies:['Siemens','BMW','SAP','Allianz','Deutsche Bank','Bosch','Volkswagen'], schools:['TU Munich','Humboldt University','LMU Munich','Heidelberg University'], interests:['Football','Beer','Travel','Music','Engineering','Hiking','Cycling','Church','Reading','Photography'], emailDomains:['gmail.com','gmx.de','web.de','outlook.com'] },
  France: { firstNames:['Lucas','Emma','Hugo','Jade','Louis','Léa','Gabriel','Chloé','Raphaël','Alice','Arthur','Manon','Jules','Camille','Adam','Inès'], lastNames:['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau'], cities:['Paris','Marseille','Lyon','Toulouse','Nice','Nantes','Strasbourg','Bordeaux','Lille','Montpellier'], states:['Île-de-France','Provence','Auvergne-Rhône-Alpes','Occitanie','Nouvelle-Aquitaine','Brittany','Normandy'], phonePrefix:'33', phonLen:9, weight:2, occupations:['Engineer','Designer','Chef','Teacher','Developer','Manager','Writer','Artist'], companies:['LVMH','TotalEnergies','L\'Oréal','BNP Paribas','Airbus','Renault'], schools:['Sorbonne','École Polytechnique','HEC Paris','Sciences Po','ENS'], interests:['Wine','Art','Cinema','Cooking','Fashion','Football','Travel','Literature','Music','Photography'], emailDomains:['gmail.com','yahoo.fr','orange.fr','outlook.fr'] },
  Philippines: { firstNames:['Juan','Maria','Jose','Ana','Mark','Grace','John','Joy','Michael','Angel','James','Rose','David','Faith','Paul','Hope','Carlo','Mae','Ryan','Lyn'], lastNames:['Santos','Reyes','Cruz','Garcia','Mendoza','Torres','Villanueva','Ramos','Gonzales','Flores','Dela Cruz','Aquino','Bautista','Castillo'], cities:['Manila','Quezon City','Cebu City','Davao','Makati','Pasig','Taguig','Zamboanga','Cagayan de Oro','Bacolod','Iloilo','Baguio'], states:['Metro Manila','Cebu','Davao','Calabarzon','Central Luzon','Western Visayas','Ilocos'], phonePrefix:'63', phonLen:10, weight:3, occupations:['BPO Agent','Nurse','Teacher','Developer','Seaman','OFW','Accountant','Engineer','Pastor','Virtual Assistant'], companies:['Jollibee','SM Group','Ayala Corp','PLDT','Globe Telecom','BDO','Manila Water'], schools:['University of the Philippines','Ateneo','De La Salle','UST','FEU','Mapua'], interests:['Basketball','Karaoke','Church','Food','Music','Social Media','Dance','Travel','Movies','Volleyball','Ministry','Family'], emailDomains:['gmail.com','yahoo.com','outlook.com'] },
  Australia: { firstNames:['Jack','Charlotte','Oliver','Olivia','William','Amelia','Noah','Isla','Thomas','Ava','James','Mia','Ethan','Grace','Lucas','Chloe','Henry','Sophie','Liam','Emily'], lastNames:['Smith','Jones','Williams','Brown','Wilson','Taylor','Johnson','White','Martin','Anderson','Thompson','Thomas','Walker','Harris','Lee','Ryan','Robinson','Kelly','King','Campbell'], cities:['Sydney','Melbourne','Brisbane','Perth','Adelaide','Gold Coast','Canberra','Hobart','Darwin','Newcastle','Wollongong','Geelong','Cairns','Townsville'], states:['New South Wales','Victoria','Queensland','Western Australia','South Australia','Tasmania','ACT','Northern Territory'], phonePrefix:'61', phonLen:9, weight:2, occupations:['Software Engineer','Teacher','Nurse','Accountant','Tradie','Marketing Manager','Doctor','Mining Engineer','Chef','Designer'], companies:['BHP','CBA','Woolworths','Telstra','Rio Tinto','NAB','Westpac','ANZ','Qantas','Atlassian'], schools:['University of Melbourne','University of Sydney','UNSW','ANU','Monash University','UQ'], interests:['AFL','Cricket','Surfing','BBQ','Travel','Bush Walking','Coffee','Beach','Music','Church','Rugby','Photography','Wine'], emailDomains:['gmail.com','yahoo.com.au','outlook.com','icloud.com','bigpond.com'] },
  Japan: { firstNames:['Haruto','Yui','Sota','Hana','Riku','Sakura','Yuto','Aoi','Hinata','Mei','Kaito','Rin','Asahi','Mio','Minato','Yuna','Hayato','Saki','Ren','Akari'], lastNames:['Sato','Suzuki','Takahashi','Tanaka','Watanabe','Ito','Yamamoto','Nakamura','Kobayashi','Kato','Yoshida','Yamada','Sasaki','Yamaguchi','Matsumoto'], cities:['Tokyo','Osaka','Yokohama','Nagoya','Sapporo','Kobe','Fukuoka','Kyoto','Sendai','Hiroshima','Chiba','Kawasaki','Kitakyushu','Nara'], states:['Tokyo','Osaka','Kanagawa','Aichi','Hokkaido','Hyogo','Fukuoka','Kyoto','Miyagi','Hiroshima','Chiba','Saitama'], phonePrefix:'81', phonLen:10, weight:2, occupations:['Engineer','Salaryman','Teacher','Designer','Developer','Nurse','Chef','Artist','Translator','Consultant'], companies:['Toyota','Sony','Nintendo','Honda','SoftBank','Panasonic','Mitsubishi','Hitachi','NTT','Rakuten'], schools:['University of Tokyo','Kyoto University','Waseda','Keio','Osaka University','Tohoku University'], interests:['Anime','Manga','Gaming','J-Pop','Food','Onsen','Technology','Photography','Travel','Fashion','Baseball','Martial Arts'], emailDomains:['gmail.com','yahoo.co.jp','outlook.com','icloud.com'] },
  'South Korea': { firstNames:['Minjun','Soyeon','Jiho','Minji','Seojun','Yuna','Jiwon','Eunji','Hyunwoo','Sujin','Dohyun','Jiyeon','Yeongjun','Chaewon','Junho','Dahyun','Seonwoo','Yerin','Taehyun','Seoyeon'], lastNames:['Kim','Lee','Park','Choi','Jung','Kang','Cho','Yoon','Jang','Lim','Han','Oh','Seo','Shin','Kwon','Hwang','Ahn','Song','Yoo','Hong'], cities:['Seoul','Busan','Incheon','Daegu','Daejeon','Gwangju','Suwon','Ulsan','Sejong','Jeju','Changwon','Seongnam','Goyang'], states:['Seoul','Busan','Incheon','Gyeonggi','Gangwon','Chungcheong','Jeolla','Gyeongsang','Jeju'], phonePrefix:'82', phonLen:10, weight:2, occupations:['Engineer','Designer','Teacher','Developer','K-Beauty Expert','Marketing','Content Creator','Researcher','Pastor'], companies:['Samsung','LG','Hyundai','SK Group','Naver','Kakao','CJ Group','Lotte','Hana Bank'], schools:['Seoul National University','KAIST','Yonsei University','Korea University','POSTECH','Sungkyunkwan'], interests:['K-Pop','K-Drama','Gaming','Skincare','Food','Coffee','Fashion','Tech','Church','Photography','Fitness','Travel'], emailDomains:['gmail.com','naver.com','daum.net','outlook.com'] },
};

// Merge all
Object.assign(COUNTRIES, MORE_COUNTRIES);

// ==========================================
// BIO TEMPLATES
// ==========================================
const BIO_TEMPLATES = [
  "{occupation} based in {city}, {country}. {interest1} enthusiast.",
  "Living life to the fullest in {city} 🌍 | {occupation} | Love {interest1} & {interest2}",
  "{occupation} | {city}, {country} | Passionate about {interest1}",
  "🙏 Believer | {occupation} | {city} | {interest1} lover",
  "{interest1} | {interest2} | {interest3} | Based in {city}",
  "Just a {occupation} who loves {interest1} and {interest2} ✨",
  "{city} 📍 | {occupation} | Making the world better one day at a time",
  "Content creator from {city}, {country}. Sharing my journey in {interest1}.",
  "📚 {interest1} | 🎵 {interest2} | 💼 {occupation} | 📍 {city}",
  "Faith. Family. {interest1}. | {occupation} in {city}",
  "Building cool stuff at {company} | {city} | {interest1}",
  "Proudly from {city}, {country} 🇳🇬 | {occupation}",
  "{occupation} @{company} | {interest1} & {interest2} | {city}",
  "Dreamer. Doer. {occupation}. Living in {city}.",
  "God first 🙏 | {occupation} | {city}, {country}",
];

const ABOUT_TEMPLATES = [
  "I'm a passionate {occupation} based in {city}, {country}. I've been working in this field for {years} years and love every minute of it. When I'm not working, you'll find me exploring {interest1} or catching up on {interest2}. I believe in making a positive impact in my community and connecting with like-minded people.",
  "Hey there! I'm from {city} and I work as a {occupation}. I graduated from {school} and have been on an incredible journey since. My passions include {interest1}, {interest2}, and {interest3}. I joined CYBEV to connect with creators worldwide and share my story.",
  "Born and raised in {city}, {country}. Currently working as a {occupation} at {company}. I'm deeply passionate about {interest1} and spend my weekends exploring {interest2}. Faith is central to my life and I love being part of a community that values creativity and connection.",
  "Professional {occupation} with {years} years of experience. Based in the beautiful city of {city}. I'm always looking to learn new things and meet interesting people. My interests include {interest1}, {interest2}, and {interest3}.",
];

const GENDERS = ['male', 'female'];
const RELATIONSHIP_STATUSES = ['single', 'in_relationship', 'married', 'prefer_not_to_say'];
const LANGUAGES_POOL = ['English', 'French', 'Spanish', 'Portuguese', 'Arabic', 'Mandarin', 'Hindi', 'Swahili', 'German', 'Japanese', 'Korean', 'Yoruba', 'Igbo', 'Hausa', 'Twi', 'Zulu', 'Xhosa'];
const SKILLS_POOL = ['Writing', 'Photography', 'Video Editing', 'Public Speaking', 'Leadership', 'Music', 'Graphic Design', 'Social Media', 'Marketing', 'Coding', 'Teaching', 'Counseling', 'Event Planning', 'Web Development', 'Data Analysis', 'Project Management', 'Content Creation', 'Worship Leading'];

// ==========================================
// GENERATOR CLASS
// ==========================================
class FakeUserGenerator {
  constructor() {
    this.usedEmails = new Set();
    this.usedUsernames = new Set();
    this.weightedCountries = [];
    
    for (const [name, data] of Object.entries(COUNTRIES)) {
      for (let i = 0; i < (data.weight || 1); i++) {
        this.weightedCountries.push(name);
      }
    }
  }

  _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  _pickN(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
  }
  _rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  _generateUsername(firstName, lastName) {
    const fl = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ll = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const patterns = [
      () => `${fl}${ll}${this._rand(1, 999)}`,
      () => `${fl}_${ll}${this._rand(1, 99)}`,
      () => `${fl}.${ll}${this._rand(1, 99)}`,
      () => `${fl}${this._rand(100, 9999)}`,
      () => `${fl[0]}${ll}${this._rand(10, 999)}`,
      () => `${ll}${fl[0]}${this._rand(10, 999)}`,
    ];
    
    for (let i = 0; i < 50; i++) {
      const username = this._pick(patterns)();
      if (!this.usedUsernames.has(username)) {
        this.usedUsernames.add(username);
        return username;
      }
    }
    const fallback = `user${Date.now()}${this._rand(1, 9999)}`;
    this.usedUsernames.add(fallback);
    return fallback;
  }

  _generateEmail(firstName, lastName, domains) {
    const fl = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ll = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domain = this._pick(domains);
    const seps = ['', '.', '_'];
    
    for (let i = 0; i < 50; i++) {
      const sep = this._pick(seps);
      const num = this._rand(1, 9999);
      const email = `${fl}${sep}${ll}${num}@${domain}`;
      if (!this.usedEmails.has(email)) {
        this.usedEmails.add(email);
        return email;
      }
    }
    const uid = crypto.randomBytes(4).toString('hex');
    const email = `${fl}${uid}@${this._pick(domains)}`;
    this.usedEmails.add(email);
    return email;
  }

  _generateBio(data, countryName, city, occupation) {
    const template = this._pick(BIO_TEMPLATES);
    const interests = this._pickN(data.interests, 3);
    return template
      .replace(/{city}/g, city)
      .replace(/{country}/g, countryName)
      .replace(/{occupation}/g, occupation)
      .replace(/{interest1}/g, interests[0] || 'Music')
      .replace(/{interest2}/g, interests[1] || 'Travel')
      .replace(/{interest3}/g, interests[2] || 'Food')
      .replace(/{company}/g, this._pick(data.companies || ['CYBEV']));
  }

  _generateAbout(data, countryName, city, occupation) {
    const template = this._pick(ABOUT_TEMPLATES);
    const interests = this._pickN(data.interests, 3);
    return template
      .replace(/{city}/g, city)
      .replace(/{country}/g, countryName)
      .replace(/{occupation}/g, occupation)
      .replace(/{interest1}/g, interests[0] || 'Music')
      .replace(/{interest2}/g, interests[1] || 'Travel')
      .replace(/{interest3}/g, interests[2] || 'Food')
      .replace(/{company}/g, this._pick(data.companies || ['CYBEV']))
      .replace(/{school}/g, this._pick(data.schools || ['University']))
      .replace(/{years}/g, this._rand(2, 15));
  }

  _generatePhone(prefix, len) {
    let digits = String(this._rand(1, 9));
    for (let i = 1; i < len; i++) digits += String(this._rand(0, 9));
    return `+${prefix}${digits}`;
  }

  _generateDOB() {
    const year = this._rand(1975, 2004);
    const month = this._rand(1, 12);
    const day = this._rand(1, 28);
    return new Date(year, month - 1, day);
  }

  _generateCreatedAt(daysBack = 365) {
    const now = Date.now();
    const offset = this._rand(1, daysBack) * 24 * 60 * 60 * 1000;
    return new Date(now - offset);
  }

  _generateAvatar(name, gender) {
    // DiceBear API - generates unique avatars
    const style = this._pick(['avataaars', 'personas', 'notionists', 'lorelei', 'micah']);
    const seed = encodeURIComponent(name + this._rand(1, 99999));
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
  }

  _generateCover() {
    const gradients = [
      'https://api.dicebear.com/7.x/shapes/svg?seed=' + this._rand(1, 99999),
    ];
    return this._pick(gradients);
  }

  generateUser(options = {}) {
    const countryName = options.country || this._pick(this.weightedCountries);
    const data = COUNTRIES[countryName];
    if (!data) throw new Error(`Unknown country: ${countryName}`);

    const gender = this._pick(GENDERS);
    const firstName = this._pick(data.firstNames);
    const lastName = this._pick(data.lastNames);
    const fullName = `${firstName} ${lastName}`;
    const username = this._generateUsername(firstName, lastName);
    const email = this._generateEmail(firstName, lastName, data.emailDomains);
    const city = this._pick(data.cities);
    const state = this._pick(data.states);
    const occupation = this._pick(data.occupations);
    const dob = this._generateDOB();
    const createdAt = options.createdAt || this._generateCreatedAt(options.daysBack || 365);

    const user = {
      name: fullName,
      email: email,
      username: username,
      password: '$2a$10$dummyHashedPasswordForSyntheticUsersOnly000000000000', // Pre-hashed dummy
      bio: this._generateBio(data, countryName, city, occupation),
      avatar: this._generateAvatar(fullName, gender),
      coverImage: this._generateCover(),
      location: `${city}, ${countryName}`,
      
      locationData: {
        providedCountry: countryName,
        providedCity: city,
        providedLocation: `${city}, ${state}, ${countryName}`,
        detectedCountry: countryName,
        detectedCity: city,
        detectedRegion: state,
        locationType: 'verified',
        locationMatches: true,
      },

      personalInfo: {
        firstName,
        lastName,
        dateOfBirth: dob,
        gender,
        phone: this._generatePhone(data.phonePrefix, data.phonLen),
        currentCity: city,
        currentCountry: countryName,
        hometown: this._pick(data.cities),
        hometownCountry: countryName,
        occupation,
        company: Math.random() > 0.4 ? this._pick(data.companies || []) : '',
        jobTitle: occupation,
        education: this._pick(data.schools || []),
        school: this._pick(data.schools || []),
        graduationYear: this._rand(2000, 2024),
        relationshipStatus: this._pick(RELATIONSHIP_STATUSES),
        interests: this._pickN(data.interests, this._rand(3, 7)),
        skills: this._pickN(SKILLS_POOL, this._rand(2, 5)),
        languages: this._pickN(LANGUAGES_POOL, this._rand(1, 3)),
        aboutMe: this._generateAbout(data, countryName, city, occupation),
        religion: Math.random() > 0.3 ? 'Christianity' : '',
        favoriteQuote: '',
        visibility: {
          dateOfBirth: 'friends',
          phone: 'only_me',
          email: 'friends',
          location: 'public',
          relationshipStatus: 'friends',
          workplace: 'public',
        }
      },

      // Social stats (will be updated by engagement simulator)
      followerCount: this._rand(5, 500),
      followingCount: this._rand(10, 300),
      followersCount: 0, // Will sync in pre-save

      // Onboarding
      hasCompletedOnboarding: true,
      onboardingData: {
        fullName,
        role: this._pick(['creator', 'viewer', 'ministry', 'business']),
        goals: this._pickN(['grow_audience', 'create_content', 'connect', 'monetize', 'ministry'], 2),
        experience: this._pick(['beginner', 'intermediate', 'experienced']),
        completedAt: createdAt,
      },

      // Preferences
      preferences: {
        emailNotifications: Math.random() > 0.3,
        pushNotifications: Math.random() > 0.2,
        newsletterSubscription: Math.random() > 0.5,
        theme: this._pick(['light', 'dark', 'system']),
        language: 'en',
      },

      // Status
      isVerified: Math.random() > 0.7,
      isAdmin: false,
      role: Math.random() > 0.7 ? 'creator' : 'user',
      status: 'active',
      isEmailVerified: true,
      linkedProviders: ['email'],

      // Synthetic marker
      isSynthetic: true,
      syntheticMeta: {
        generatedAt: new Date(),
        batchId: options.batchId || null,
        sourceCountry: countryName,
        version: '1.0',
      },

      // Timestamps
      createdAt,
      updatedAt: createdAt,
      lastLogin: new Date(createdAt.getTime() + this._rand(1, 30) * 24 * 60 * 60 * 1000),
    };

    return user;
  }

  generateBatch(count, options = {}) {
    const users = [];
    const batchId = options.batchId || `batch_${Date.now()}`;
    for (let i = 0; i < count; i++) {
      users.push(this.generateUser({ ...options, batchId }));
    }
    return users;
  }
}

module.exports = { FakeUserGenerator, COUNTRIES };
