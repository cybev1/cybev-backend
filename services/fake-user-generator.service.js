// ============================================
// FILE: services/fake-user-generator.service.js
// Synthetic User Generation Engine V2.0
// FEATURES:
//   - 40+ countries weighted by internet user share
//   - Ethnic group matching (names → regions)
//   - Diaspora modeling (5-10% live abroad)
//   - Complete CYBEV profiles (phone, city, bio, etc.)
//   - Auto-follow admin accounts on generation
// ============================================

const mongoose = require('mongoose');
const crypto = require('crypto');

// ==========================================
// INTERNET USER SHARE WEIGHTS (2025 data)
// Approximate proportions based on global
// internet users (~5.5 billion total)
// ==========================================

const COUNTRIES = {

  // ============= ASIA (50%+ of internet) =============

  China: {
    weight: 40,  // 1.05B users
    phonePrefix: '86', phoneLen: 11,
    emailDomains: ['gmail.com','qq.com','163.com','126.com','outlook.com'],
    ethnicGroups: [
      { name: 'Han Chinese', weight: 92,
        firstNames: ['Wei','Fang','Jing','Lei','Xia','Tao','Yun','Hui','Ming','Chao','Yan','Bo','Ling','Hao','Mei','Jie','Xin','Ping','Qiang','Li','Jun','Ting','Yu','Nan','Zhi','Rui','Chen','Shuang','Gang','Hong'],
        lastNames: ['Wang','Li','Zhang','Liu','Chen','Yang','Huang','Zhao','Wu','Zhou','Xu','Sun','Ma','Zhu','Hu','Guo','Lin','He','Gao','Luo','Zheng','Liang','Xie','Song','Tang','Deng','Han','Feng','Cao','Peng'],
        regions: [
          { state: 'Beijing', cities: ['Beijing','Haidian','Chaoyang','Dongcheng','Xicheng','Fengtai'] },
          { state: 'Shanghai', cities: ['Shanghai','Pudong','Jing\'an','Huangpu','Minhang'] },
          { state: 'Guangdong', cities: ['Guangzhou','Shenzhen','Dongguan','Foshan','Zhuhai','Zhongshan','Huizhou'] },
          { state: 'Zhejiang', cities: ['Hangzhou','Ningbo','Wenzhou','Shaoxing','Jiaxing','Taizhou'] },
          { state: 'Jiangsu', cities: ['Nanjing','Suzhou','Wuxi','Changzhou','Nantong','Xuzhou'] },
          { state: 'Sichuan', cities: ['Chengdu','Mianyang','Deyang','Leshan','Nanchong'] },
          { state: 'Hubei', cities: ['Wuhan','Yichang','Xiangyang','Jingzhou','Huanggang'] },
          { state: 'Hunan', cities: ['Changsha','Zhuzhou','Xiangtan','Hengyang','Yueyang'] },
          { state: 'Fujian', cities: ['Fuzhou','Xiamen','Quanzhou','Zhangzhou','Putian'] },
          { state: 'Shandong', cities: ['Jinan','Qingdao','Yantai','Weihai','Zibo','Linyi'] },
          { state: 'Henan', cities: ['Zhengzhou','Luoyang','Kaifeng','Xinxiang','Nanyang'] },
          { state: 'Liaoning', cities: ['Shenyang','Dalian','Anshan','Fushun'] },
        ]
      }
    ],
    occupations: ['Engineer','Teacher','Business Owner','Developer','Designer','Doctor','Marketing Manager','Finance Manager','Researcher','Entrepreneur','Civil Servant','Freelancer'],
    companies: ['Huawei','Alibaba','Tencent','ByteDance','Baidu','Xiaomi','JD.com','Meituan','NIO','DJI','Lenovo','OPPO'],
    schools: ['Tsinghua University','Peking University','Fudan University','Zhejiang University','Shanghai Jiao Tong','Nanjing University','USTC','Wuhan University'],
    interests: ['Tech','Gaming','Food','Travel','Photography','Music','Fitness','Reading','K-Drama','Anime','E-commerce','Badminton','Basketball','Table Tennis'],
  },

  India: {
    weight: 35,  // 900M users
    phonePrefix: '91', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.co.in','outlook.com','rediffmail.com','hotmail.com'],
    ethnicGroups: [
      { name: 'North Indian', weight: 40,
        firstNames: ['Aarav','Priya','Arjun','Ananya','Vihaan','Diya','Aditya','Isha','Rohan','Kavya','Raj','Pooja','Amit','Neha','Vikram','Meera','Rahul','Divya','Sanjay','Anjali','Deepak','Nisha','Ravi','Sunita','Mohit','Anu','Kunal','Swati'],
        lastNames: ['Sharma','Kumar','Singh','Gupta','Verma','Mishra','Yadav','Jain','Agarwal','Chauhan','Tiwari','Pandey','Dubey','Saxena','Srivastava','Rawat','Bhatt'],
        regions: [
          { state: 'Delhi', cities: ['New Delhi','Noida','Gurgaon','Faridabad','Ghaziabad','Dwarka','Rohini'] },
          { state: 'Uttar Pradesh', cities: ['Lucknow','Kanpur','Varanasi','Agra','Prayagraj','Meerut','Bareilly','Aligarh','Mathura'] },
          { state: 'Rajasthan', cities: ['Jaipur','Jodhpur','Udaipur','Kota','Ajmer','Bikaner','Alwar'] },
          { state: 'Madhya Pradesh', cities: ['Bhopal','Indore','Jabalpur','Gwalior','Ujjain'] },
          { state: 'Bihar', cities: ['Patna','Gaya','Muzaffarpur','Bhagalpur','Darbhanga'] },
          { state: 'Punjab', cities: ['Chandigarh','Ludhiana','Amritsar','Jalandhar','Patiala'] },
          { state: 'Haryana', cities: ['Gurgaon','Faridabad','Panipat','Ambala','Karnal','Hisar'] },
        ]
      },
      { name: 'South Indian', weight: 30,
        firstNames: ['Krishna','Lakshmi','Arjun','Swetha','Karthik','Ananya','Vishnu','Priya','Ganesh','Divya','Srinivas','Meenakshi','Rajesh','Deepa','Suresh','Kavitha','Ramesh','Saranya','Venkat','Bhavani','Arun','Padma','Prasad','Mala'],
        lastNames: ['Reddy','Rao','Nair','Pillai','Iyer','Iyengar','Menon','Naidu','Patel','Bhat','Hegde','Shetty','Kamath','Varma','Krishnan','Subramaniam','Rajan','Murthy'],
        regions: [
          { state: 'Tamil Nadu', cities: ['Chennai','Coimbatore','Madurai','Tiruchirappalli','Salem','Tirunelveli','Erode','Vellore'] },
          { state: 'Karnataka', cities: ['Bangalore','Mysore','Hubli','Mangalore','Belgaum','Shimoga','Udupi'] },
          { state: 'Kerala', cities: ['Kochi','Thiruvananthapuram','Kozhikode','Thrissur','Kollam','Alappuzha','Palakkad','Kannur'] },
          { state: 'Telangana', cities: ['Hyderabad','Warangal','Nizamabad','Karimnagar','Khammam'] },
          { state: 'Andhra Pradesh', cities: ['Visakhapatnam','Vijayawada','Tirupati','Guntur','Kakinada','Rajahmundry','Nellore'] },
        ]
      },
      { name: 'Western Indian', weight: 20,
        firstNames: ['Harsh','Jinal','Darshan','Riya','Jay','Disha','Yash','Krupa','Parth','Mital','Chirag','Heena','Ketan','Nandini','Sagar','Komal','Viral','Drashti'],
        lastNames: ['Patel','Shah','Mehta','Desai','Joshi','Kulkarni','Pawar','Shinde','Thakur','Jadhav','Chavan','Patil','More','Bhagat','Solanki','Rane','Deshpande'],
        regions: [
          { state: 'Maharashtra', cities: ['Mumbai','Pune','Nagpur','Nashik','Thane','Aurangabad','Kolhapur','Solapur','Sangli','Navi Mumbai'] },
          { state: 'Gujarat', cities: ['Ahmedabad','Surat','Vadodara','Rajkot','Bhavnagar','Gandhinagar','Anand','Jamnagar'] },
          { state: 'Goa', cities: ['Panaji','Margao','Vasco da Gama','Mapusa','Ponda'] },
        ]
      },
      { name: 'Eastern Indian', weight: 10,
        firstNames: ['Sourav','Arpita','Debashis','Moumita','Arijit','Rituparna','Subhash','Tanushree','Prasenjit','Aditi','Arnab','Satabdi','Bikash','Debjani','Rajib','Madhuri'],
        lastNames: ['Das','Ghosh','Bose','Banerjee','Chatterjee','Mukherjee','Sen','Roy','Sarkar','Chakraborty','Dey','Saha','Mondal','Paul','Nath','Barua'],
        regions: [
          { state: 'West Bengal', cities: ['Kolkata','Howrah','Durgapur','Asansol','Siliguri','Kharagpur','Haldia','Kalyani'] },
          { state: 'Odisha', cities: ['Bhubaneswar','Cuttack','Rourkela','Puri','Berhampur','Sambalpur'] },
          { state: 'Assam', cities: ['Guwahati','Silchar','Dibrugarh','Jorhat','Tezpur','Nagaon'] },
        ]
      },
    ],
    occupations: ['Software Engineer','Doctor','Teacher','Accountant','Business Owner','Data Scientist','Marketing Manager','Civil Servant','Pharmacist','IT Consultant','Nurse','Content Creator','Pastor'],
    companies: ['TCS','Infosys','Wipro','Reliance','HDFC Bank','ICICI Bank','Flipkart','Zomato','Paytm','HCL','Swiggy','Razorpay','Ola','Freshworks'],
    schools: ['IIT Bombay','IIT Delhi','IIM Ahmedabad','BITS Pilani','Delhi University','Anna University','VIT','SRM','Manipal','Christ University','Loyola College'],
    interests: ['Cricket','Bollywood','Tech','Cooking','Yoga','Music','Travel','Photography','Church','Dance','Reading','Spirituality','Business','Fashion','Football'],
  },

  Indonesia: {
    weight: 8,  // 212M users
    phonePrefix: '62', phoneLen: 11,
    emailDomains: ['gmail.com','yahoo.co.id','outlook.com'],
    ethnicGroups: [
      { name: 'Javanese', weight: 45,
        firstNames: ['Budi','Siti','Agus','Dewi','Hendra','Ratna','Joko','Sri','Wahyu','Eka','Bambang','Indah','Doni','Wulan','Adi','Lestari','Rudi','Ayu','Dedi','Rina'],
        lastNames: ['Wijaya','Susanto','Santoso','Pratama','Hidayat','Nugroho','Setiawan','Kurniawan','Saputra','Wibowo','Hartono','Gunawan','Surya','Utomo','Prasetyo'],
        regions: [
          { state: 'DKI Jakarta', cities: ['Jakarta','South Jakarta','North Jakarta','West Jakarta','East Jakarta','Central Jakarta'] },
          { state: 'West Java', cities: ['Bandung','Bekasi','Depok','Bogor','Cirebon','Sukabumi','Tasikmalaya'] },
          { state: 'Central Java', cities: ['Semarang','Solo','Magelang','Pekalongan','Tegal','Purwokerto'] },
          { state: 'East Java', cities: ['Surabaya','Malang','Sidoarjo','Kediri','Jember','Madiun'] },
        ]
      },
      { name: 'Sundanese', weight: 15,
        firstNames: ['Asep','Neng','Ujang','Teteh','Dadan','Euis','Cecep','Imas','Endang','Yayat'],
        lastNames: ['Suryadi','Permana','Hidayat','Firmansyah','Ramadhan','Hermawan','Iskandar'],
        regions: [
          { state: 'West Java', cities: ['Bandung','Garut','Cianjur','Sukabumi','Subang','Purwakarta'] },
          { state: 'Banten', cities: ['Tangerang','Serang','Cilegon','South Tangerang'] },
        ]
      },
      { name: 'Balinese & Others', weight: 40,
        firstNames: ['Made','Ni','Ketut','Wayan','Putu','Nyoman','Kadek','Komang','Gede','Luh'],
        lastNames: ['Suardana','Astawa','Wirawan','Arjana','Sudiarta','Mahendra','Putra','Dewi'],
        regions: [
          { state: 'Bali', cities: ['Denpasar','Ubud','Kuta','Seminyak','Sanur','Gianyar'] },
          { state: 'North Sumatra', cities: ['Medan','Pematang Siantar','Binjai','Padang Sidempuan'] },
          { state: 'South Sulawesi', cities: ['Makassar','Parepare','Palopo','Maros'] },
          { state: 'West Kalimantan', cities: ['Pontianak','Singkawang','Ketapang'] },
          { state: 'Yogyakarta', cities: ['Yogyakarta','Sleman','Bantul'] },
        ]
      }
    ],
    occupations: ['Teacher','Civil Servant','Business Owner','Developer','Marketing','Farmer','Nurse','Engineer','Content Creator','Freelancer'],
    companies: ['GoTo','Tokopedia','Bukalapak','Telkomsel','Bank BCA','Grab Indonesia','Traveloka','Indosat'],
    schools: ['University of Indonesia','ITB','Gadjah Mada University','Airlangga University','Binus University'],
    interests: ['Football','Badminton','Music','Food','Travel','Photography','Gaming','Religion','Social Media','Cooking','Fashion','Motorbikes'],
  },

  Japan: {
    weight: 5,  // 118M
    phonePrefix: '81', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.co.jp','outlook.com','icloud.com','docomo.ne.jp'],
    ethnicGroups: [
      { name: 'Japanese', weight: 100,
        firstNames: ['Haruto','Yui','Sota','Hana','Riku','Sakura','Yuto','Aoi','Hinata','Mei','Kaito','Rin','Asahi','Mio','Minato','Yuna','Hayato','Saki','Ren','Akari','Takumi','Nana','Daiki','Honoka','Kento','Misaki'],
        lastNames: ['Sato','Suzuki','Takahashi','Tanaka','Watanabe','Ito','Yamamoto','Nakamura','Kobayashi','Kato','Yoshida','Yamada','Sasaki','Yamaguchi','Matsumoto','Inoue','Kimura','Shimizu','Hayashi','Saito'],
        regions: [
          { state: 'Tokyo', cities: ['Tokyo','Shibuya','Shinjuku','Minato','Setagaya','Nerima','Suginami','Chiyoda','Ikebukuro'] },
          { state: 'Osaka', cities: ['Osaka','Sakai','Higashiosaka','Suita','Toyonaka','Ibaraki'] },
          { state: 'Kanagawa', cities: ['Yokohama','Kawasaki','Sagamihara','Fujisawa','Kamakura'] },
          { state: 'Aichi', cities: ['Nagoya','Toyota','Okazaki','Ichinomiya','Kasugai'] },
          { state: 'Hokkaido', cities: ['Sapporo','Asahikawa','Hakodate','Kushiro','Obihiro'] },
          { state: 'Fukuoka', cities: ['Fukuoka','Kitakyushu','Kurume','Omuta'] },
          { state: 'Kyoto', cities: ['Kyoto','Uji','Kameoka','Nagaokakyo'] },
          { state: 'Hyogo', cities: ['Kobe','Himeji','Nishinomiya','Amagasaki','Akashi'] },
        ]
      }
    ],
    occupations: ['Engineer','Salaryman','Teacher','Designer','Developer','Nurse','Chef','Artist','Researcher','Translator','Consultant','Content Creator'],
    companies: ['Toyota','Sony','Nintendo','Honda','SoftBank','Panasonic','Hitachi','Rakuten','NTT','Mitsubishi','Canon','Fujitsu'],
    schools: ['University of Tokyo','Kyoto University','Waseda','Keio','Osaka University','Tohoku University','Nagoya University'],
    interests: ['Anime','Manga','Gaming','J-Pop','Food','Onsen','Technology','Photography','Travel','Fashion','Baseball','Martial Arts','Hiking'],
  },

  Bangladesh: {
    weight: 5,  // 120M
    phonePrefix: '880', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.com','outlook.com'],
    ethnicGroups: [
      { name: 'Bengali', weight: 100,
        firstNames: ['Rahim','Fatima','Karim','Ayesha','Hasan','Nusrat','Imran','Taslima','Shakib','Ruma','Mahbub','Sadia','Tanvir','Mitu','Rasel','Sharmin','Arif','Nadia','Sohel','Razia'],
        lastNames: ['Hossain','Ahmed','Rahman','Islam','Khan','Akter','Begum','Chowdhury','Miah','Uddin','Haque','Sultana','Kamal','Alam','Siddique'],
        regions: [
          { state: 'Dhaka Division', cities: ['Dhaka','Gazipur','Narayanganj','Tangail','Manikganj','Narsingdi','Faridpur'] },
          { state: 'Chittagong Division', cities: ['Chittagong','Cox\'s Bazar','Comilla','Rangamati','Bandarban','Sylhet'] },
          { state: 'Rajshahi Division', cities: ['Rajshahi','Bogra','Rangpur','Dinajpur','Pabna','Naogaon'] },
          { state: 'Khulna Division', cities: ['Khulna','Jessore','Satkhira','Bagerhat','Kushtia'] },
        ]
      }
    ],
    occupations: ['Garment Worker','Teacher','Farmer','IT Professional','Doctor','Businessman','Engineer','Banker','NGO Worker','Rickshaw Driver','Shop Owner'],
    companies: ['Grameenphone','Brac','Robi','Banglalink','Square Group','Beximco','Walton','bKash'],
    schools: ['University of Dhaka','BUET','North South University','BRAC University','Chittagong University'],
    interests: ['Cricket','Football','Music','Cooking','Religion','Social Media','Fashion','Movies','Travel','Photography'],
  },

  Philippines: {
    weight: 4,  // 85M
    phonePrefix: '63', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.com','outlook.com'],
    ethnicGroups: [
      { name: 'Tagalog', weight: 40,
        firstNames: ['Juan','Maria','Jose','Ana','Mark','Grace','John','Joy','Michael','Angel','James','Rose','Paul','Hope','Carlo','Mae','Ryan','Lyn','Miguel','Bea'],
        lastNames: ['Santos','Reyes','Cruz','Garcia','Mendoza','Torres','Villanueva','Ramos','Gonzales','Flores','Dela Cruz','Aquino','Bautista','Castillo','Fernandez','De Leon'],
        regions: [
          { state: 'Metro Manila', cities: ['Manila','Quezon City','Makati','Pasig','Taguig','Mandaluyong','Parañaque','Pasay','Caloocan','Marikina'] },
          { state: 'Calabarzon', cities: ['Antipolo','Bacoor','Imus','Dasmariñas','Lucena','Batangas City','Lipa','Tanauan'] },
          { state: 'Central Luzon', cities: ['San Fernando','Angeles City','Tarlac City','Cabanatuan','Malolos','Olongapo'] },
        ]
      },
      { name: 'Visayan', weight: 35,
        firstNames: ['Jerico','Lovely','Rodel','Cherry','Jomar','Jhane','Arnel','Maricel','Nonoy','Inday','Dodong','Daisy','Junjun','Lorna','Boy','Nene'],
        lastNames: ['Dela Peña','Magno','Magbanua','Maglaya','Villaruel','Tampus','Abella','Pepito','Palacios','Ceniza','Tan','Go','Uy','Lim','Chua'],
        regions: [
          { state: 'Central Visayas', cities: ['Cebu City','Lapu-Lapu','Mandaue','Talisay','Danao','Bogo'] },
          { state: 'Western Visayas', cities: ['Iloilo City','Bacolod','Roxas City','Kalibo','San Jose'] },
          { state: 'Eastern Visayas', cities: ['Tacloban','Ormoc','Catbalogan','Calbayog'] },
        ]
      },
      { name: 'Mindanaoan', weight: 25,
        firstNames: ['Abdul','Fatima','Omar','Amina','Ali','Norhaina','Ibrahim','Sittie','Ahmad','Bai','Mohammad','Princess','Sultan','Jasmin'],
        lastNames: ['Macarambon','Dimaporo','Pangandaman','Adiong','Lucman','Sinsuat','Mangudadatu','Ampatuan','Balindong','Datu'],
        regions: [
          { state: 'Davao Region', cities: ['Davao City','Tagum','Panabo','Digos','Mati'] },
          { state: 'Northern Mindanao', cities: ['Cagayan de Oro','Iligan','Bukidnon','Ozamiz','Gingoog'] },
          { state: 'BARMM', cities: ['Cotabato City','Marawi','Lamitan','Jolo'] },
          { state: 'Soccsksargen', cities: ['General Santos','Koronadal','Kidapawan','Tacurong'] },
        ]
      }
    ],
    occupations: ['BPO Agent','Nurse','Teacher','Developer','Seaman','OFW','Accountant','Engineer','Pastor','Virtual Assistant','Call Center Agent','Freelancer'],
    companies: ['Jollibee','SM Group','Ayala Corp','PLDT','Globe Telecom','BDO','Manila Water','Converge','Accenture PH'],
    schools: ['University of the Philippines','Ateneo','De La Salle','UST','FEU','Mapua','AMA','STI'],
    interests: ['Basketball','Karaoke','Church','Food','Music','Social Media','Dance','Travel','Movies','Volleyball','Ministry','Family','Vlogging','K-Pop'],
  },

  'South Korea': {
    weight: 3, phonePrefix: '82', phoneLen: 10,
    emailDomains: ['gmail.com','naver.com','daum.net','kakao.com'],
    ethnicGroups: [
      { name: 'Korean', weight: 100,
        firstNames: ['Minjun','Soyeon','Jiho','Minji','Seojun','Yuna','Jiwon','Eunji','Hyunwoo','Sujin','Dohyun','Jiyeon','Yeongjun','Chaewon','Junho','Dahyun','Seonwoo','Yerin','Taehyun','Seoyeon'],
        lastNames: ['Kim','Lee','Park','Choi','Jung','Kang','Cho','Yoon','Jang','Lim','Han','Oh','Seo','Shin','Kwon','Hwang','Ahn','Song','Yoo','Hong'],
        regions: [
          { state: 'Seoul', cities: ['Seoul','Gangnam','Mapo','Songpa','Yongsan','Jongno','Seodaemun','Nowon'] },
          { state: 'Gyeonggi', cities: ['Suwon','Seongnam','Goyang','Yongin','Bucheon','Anyang','Ansan','Hwaseong','Namyangju'] },
          { state: 'Busan', cities: ['Busan','Haeundae','Busanjin','Saha','Dong'] },
          { state: 'Incheon', cities: ['Incheon','Namdong','Bupyeong','Seo','Yeonsu'] },
          { state: 'Daegu', cities: ['Daegu','Suseong','Dalseo','Buk'] },
        ]
      }
    ],
    occupations: ['Engineer','Designer','Teacher','Developer','Content Creator','Marketing','Researcher','K-Beauty Expert','Translator','Pastor'],
    companies: ['Samsung','LG','Hyundai','SK Group','Naver','Kakao','CJ Group','Lotte','Hana Bank','NCSoft','Coupang'],
    schools: ['Seoul National','KAIST','Yonsei','Korea University','POSTECH','Sungkyunkwan','Hanyang','Ewha'],
    interests: ['K-Pop','K-Drama','Gaming','Skincare','Food','Coffee','Fashion','Tech','Church','Photography','Fitness','Travel','Webtoons'],
  },

  Vietnam: {
    weight: 3, phonePrefix: '84', phoneLen: 9,
    emailDomains: ['gmail.com','yahoo.com','outlook.com'],
    ethnicGroups: [
      { name: 'Vietnamese', weight: 100,
        firstNames: ['Minh','Linh','Duc','Huong','Tuan','Mai','Hieu','Ngoc','Long','Thao','Hung','Lan','Nam','Trang','Thanh','Ha','Quang','Phuong','Trung','Vy'],
        lastNames: ['Nguyen','Tran','Le','Pham','Hoang','Huynh','Phan','Vu','Dang','Bui','Do','Ho','Ngo','Duong','Ly'],
        regions: [
          { state: 'Ho Chi Minh City', cities: ['Ho Chi Minh City','Thu Duc','Binh Thanh','Go Vap','Tan Binh','District 1','District 7'] },
          { state: 'Hanoi', cities: ['Hanoi','Dong Da','Ba Dinh','Hoan Kiem','Cau Giay','Thanh Xuan'] },
          { state: 'Da Nang', cities: ['Da Nang','Hai Chau','Thanh Khe','Son Tra','Lien Chieu'] },
          { state: 'Can Tho', cities: ['Can Tho','Ninh Kieu','Cai Rang','Binh Thuy'] },
        ]
      }
    ],
    occupations: ['Developer','Teacher','Factory Worker','Business Owner','Marketing','Farmer','IT Professional','Designer','Translator','Freelancer'],
    companies: ['FPT','VinGroup','Viettel','VNPT','VPBank','Masan Group','Techcombank','Grab Vietnam'],
    schools: ['Vietnam National University','Hanoi University','FPT University','Ho Chi Minh City University of Technology'],
    interests: ['Football','Coffee','Food','Travel','Photography','Gaming','Music','Motorbikes','Fashion','Social Media','Karaoke'],
  },

  Thailand: {
    weight: 3, phonePrefix: '66', phoneLen: 9,
    emailDomains: ['gmail.com','hotmail.com','yahoo.com','outlook.com'],
    ethnicGroups: [
      { name: 'Thai', weight: 100,
        firstNames: ['Somchai','Supaporn','Prawit','Nattaya','Krit','Ploy','Anon','Nong','Chai','Fah','Benz','Ice','Prim','Bank','Film','Mint','Gun','Bow','Aom','Nut'],
        lastNames: ['Phongsri','Saelim','Srisuk','Thongkham','Wongwai','Bunmee','Chaiyasit','Rattanakorn','Phanpheng','Suthichai','Kitjakarn','Namsai'],
        regions: [
          { state: 'Bangkok', cities: ['Bangkok','Nonthaburi','Pathum Thani','Samut Prakan','Bang Na','Chatuchak','Lat Phrao'] },
          { state: 'Chiang Mai', cities: ['Chiang Mai','San Sai','Hang Dong','Mae Rim','San Kamphaeng'] },
          { state: 'Phuket', cities: ['Phuket Town','Patong','Kata','Karon','Rawai'] },
          { state: 'Chonburi', cities: ['Pattaya','Chonburi','Sri Racha','Banglamung'] },
          { state: 'Khon Kaen', cities: ['Khon Kaen','Nong Khai','Udon Thani','Nakhon Ratchasima'] },
        ]
      }
    ],
    occupations: ['Teacher','Business Owner','Marketing','Developer','Nurse','Chef','Tour Guide','Freelancer','Engineer','Designer'],
    companies: ['CP Group','PTT','Kasikornbank','SCB','True Corp','AIS','Central Group','Minor International'],
    schools: ['Chulalongkorn University','Mahidol University','Kasetsart University','Thammasat University','Chiang Mai University'],
    interests: ['Food','Muay Thai','Buddhism','Travel','Music','Social Media','Fashion','Photography','Gaming','Shopping','Temple Visits','Beach'],
  },

  Pakistan: {
    weight: 4, phonePrefix: '92', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.com','outlook.com','hotmail.com'],
    ethnicGroups: [
      { name: 'Punjabi', weight: 45,
        firstNames: ['Ahmed','Ayesha','Ali','Fatima','Hassan','Zainab','Usman','Sana','Bilal','Hira','Fahad','Maham','Hamza','Kinza','Saad','Nimra'],
        lastNames: ['Khan','Malik','Butt','Chaudhry','Rana','Gill','Raza','Sheikh','Siddiqui','Qureshi','Niazi','Bajwa','Virk','Gondal'],
        regions: [
          { state: 'Punjab', cities: ['Lahore','Faisalabad','Rawalpindi','Multan','Gujranwala','Sialkot','Sargodha','Bahawalpur','Sahiwal'] },
          { state: 'Islamabad', cities: ['Islamabad'] },
        ]
      },
      { name: 'Sindhi & Others', weight: 55,
        firstNames: ['Asad','Nazia','Waqar','Rubina','Junaid','Samina','Faisal','Bushra','Kamran','Saima','Irfan','Nida','Tahir','Amna','Nadeem','Rabia'],
        lastNames: ['Ahmed','Hussain','Mirza','Bhutto','Shah','Baloch','Mengal','Afridi','Yousafzai','Khattak','Durrani','Akhtar','Syed','Arain'],
        regions: [
          { state: 'Sindh', cities: ['Karachi','Hyderabad','Sukkur','Larkana','Nawabshah','Mirpurkhas'] },
          { state: 'Khyber Pakhtunkhwa', cities: ['Peshawar','Mardan','Abbottabad','Swat','Mingora','Nowshera'] },
          { state: 'Balochistan', cities: ['Quetta','Gwadar','Turbat','Khuzdar'] },
        ]
      }
    ],
    occupations: ['Doctor','Engineer','Teacher','Businessman','Software Developer','Banker','Journalist','Civil Servant','Army Officer','Farmer'],
    companies: ['PTCL','Jazz','Telenor Pakistan','HBL','UBL','Engro','Lucky Cement','National Bank','Systems Limited'],
    schools: ['LUMS','NUST','Aga Khan University','IBA Karachi','FAST','COMSATS','Quaid-i-Azam University','Punjab University'],
    interests: ['Cricket','Football','Music','Food','Religion','Poetry','Travel','Tech','Social Media','Drama','Gardening'],
  },

  // ============= AFRICA =============

  Nigeria: {
    weight: 5,  // 122M
    phonePrefix: '234', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.com','outlook.com','hotmail.com'],
    ethnicGroups: [
      { name: 'Yoruba', weight: 30,
        firstNames: ['Adebayo','Oluwaseun','Folake','Oluwatobi','Damilola','Temitope','Abiodun','Funmilayo','Yetunde','Olumide','Segun','Bukola','Tunde','Adebisi','Adeola','Morenike','Olamide','Titilayo','Oluwafemi','Ayobami'],
        lastNames: ['Adeyemi','Adeniyi','Balogun','Ogundele','Adeola','Bakare','Ayodeji','Ogundimu','Olatunji','Akinwale','Oyelaran','Fashola','Akinyemi','Babatunde','Adesanya'],
        regions: [
          { state: 'Lagos', cities: ['Lagos','Ikeja','Lekki','Victoria Island','Surulere','Yaba','Ikorodu','Epe','Ajah','Badagry','Oshodi','Mushin','Apapa'] },
          { state: 'Oyo', cities: ['Ibadan','Ogbomoso','Oyo Town','Iseyin','Saki'] },
          { state: 'Ogun', cities: ['Abeokuta','Ijebu Ode','Sagamu','Ilaro','Ota'] },
          { state: 'Ondo', cities: ['Akure','Ondo Town','Owo','Ikare'] },
          { state: 'Osun', cities: ['Osogbo','Ile-Ife','Ilesha','Ede','Iwo'] },
          { state: 'Ekiti', cities: ['Ado Ekiti','Ikere','Ijero','Efon'] },
          { state: 'Kwara', cities: ['Ilorin','Offa','Jebba'] },
        ]
      },
      { name: 'Igbo', weight: 30,
        firstNames: ['Chinonso','Emeka','Chidinma','Chukwuemeka','Ngozi','Ifeanyi','Ifeoma','Obinna','Nkechi','Adaeze','Chiamaka','Chidi','Nnamdi','Kelechi','Nneka','Amarachi','Uche','Okechukwu','Chioma','Onyeka'],
        lastNames: ['Okafor','Nwachukwu','Okonkwo','Eze','Okoro','Nwosu','Chukwu','Obi','Udeh','Nwankwo','Igwe','Onuoha','Nweze','Ani','Mba','Agu','Nwobi','Okeke','Ugo','Ibe'],
        regions: [
          { state: 'Enugu', cities: ['Enugu','Nsukka','Agbani','Udi','Oji River'] },
          { state: 'Anambra', cities: ['Awka','Onitsha','Nnewi','Ekwulobia','Ihiala'] },
          { state: 'Imo', cities: ['Owerri','Orlu','Okigwe','Oguta','Mbaise'] },
          { state: 'Abia', cities: ['Umuahia','Aba','Arochukwu','Ohafia'] },
          { state: 'Ebonyi', cities: ['Abakaliki','Afikpo','Onueke'] },
          { state: 'Delta', cities: ['Asaba','Warri','Ughelli','Sapele','Agbor'] },
        ]
      },
      { name: 'Hausa-Fulani', weight: 25,
        firstNames: ['Abubakar','Aisha','Ibrahim','Hauwa','Usman','Fatima','Muhammed','Hadiza','Aliyu','Maryam','Suleiman','Halima','Abdullahi','Zainab','Bello','Amina','Yusuf','Bilkisu','Garba','Rabi'],
        lastNames: ['Ibrahim','Abubakar','Mohammed','Lawal','Suleiman','Bello','Aliyu','Abdullahi','Musa','Yusuf','Danjuma','Shehu','Jibril','Umar','Waziri','Adamu','Tanko'],
        regions: [
          { state: 'Kano', cities: ['Kano','Wudil','Gwarzo','Rano','Bichi','Dala'] },
          { state: 'Kaduna', cities: ['Kaduna','Zaria','Kafanchan','Kagoro'] },
          { state: 'Sokoto', cities: ['Sokoto','Tambuwal','Bodinga'] },
          { state: 'FCT', cities: ['Abuja','Garki','Wuse','Maitama','Asokoro','Gwarinpa','Kubwa','Karu','Nyanya'] },
          { state: 'Borno', cities: ['Maiduguri','Bama','Monguno','Dikwa'] },
          { state: 'Katsina', cities: ['Katsina','Daura','Funtua','Malumfashi'] },
          { state: 'Bauchi', cities: ['Bauchi','Azare','Misau','Jama\'are'] },
        ]
      },
      { name: 'South-South', weight: 15,
        firstNames: ['Blessing','Ekanem','Iniobong','Okon','Itoro','Emem','Mfon','Aniekan','Uduak','Nsikak','Idorenyin','Bassey','Eno','Ufot','Arit','Ime'],
        lastNames: ['Effiong','Bassey','Ekanem','Udo','Akpan','Etim','Okon','Nwankwo','Inyang','Udoh','Essien','Ekpo','Asuquo','Ita','Ibanga'],
        regions: [
          { state: 'Akwa Ibom', cities: ['Uyo','Eket','Ikot Ekpene','Oron','Abak'] },
          { state: 'Cross River', cities: ['Calabar','Ogoja','Ikom','Obudu'] },
          { state: 'Rivers', cities: ['Port Harcourt','Bonny','Okrika','Degema','Omoku','Eleme'] },
          { state: 'Bayelsa', cities: ['Yenagoa','Brass','Sagbama','Ogbia'] },
          { state: 'Edo', cities: ['Benin City','Auchi','Ekpoma','Uromi','Igarra'] },
        ]
      },
    ],
    occupations: ['Software Engineer','Pastor','Teacher','Business Owner','Doctor','Nurse','Banker','Accountant','Lawyer','Journalist','Civil Servant','Trader','Musician','Fashion Designer','Content Creator','Fintech Professional'],
    companies: ['GTBank','Dangote Group','MTN Nigeria','Flutterwave','Andela','Access Bank','Paystack','Kuda Bank','PiggyVest','Interswitch','First Bank','Zenith Bank','BUA Group','Opay'],
    schools: ['University of Lagos','University of Ibadan','Covenant University','OAU','UNN','Babcock University','ABU Zaria','LAUTECH','UNIPORT','FUTO','UniAbuja'],
    interests: ['Gospel Music','Afrobeats','Football','Nollywood','Tech','Fashion','Cooking','Church','Business','Ministry','Photography','Dance','Comedy','Writing','Social Media','Crypto'],
  },

  'South Africa': {
    weight: 2, phonePrefix: '27', phoneLen: 9,
    emailDomains: ['gmail.com','yahoo.com','outlook.co.za','icloud.com'],
    ethnicGroups: [
      { name: 'Zulu/Xhosa', weight: 50,
        firstNames: ['Thabo','Nomsa','Sipho','Zanele','Mandla','Lerato','Bongani','Naledi','Tshepo','Lindiwe','Kagiso','Thandiwe','Sibusiso','Ayanda','Mpho','Nandi','Jabu','Palesa','Vusi','Nompilo'],
        lastNames: ['Nkosi','Dlamini','Zulu','Ndaba','Mthembu','Khumalo','Ngcobo','Cele','Maseko','Molefe','Zwane','Buthelezi','Gumede','Shabalala','Ntuli','Mkhize'],
        regions: [
          { state: 'Gauteng', cities: ['Johannesburg','Pretoria','Soweto','Sandton','Midrand','Centurion','Randburg','Roodepoort'] },
          { state: 'KwaZulu-Natal', cities: ['Durban','Pietermaritzburg','Newcastle','Richards Bay','Ladysmith','Umhlanga'] },
          { state: 'Eastern Cape', cities: ['Port Elizabeth','East London','Mthatha','Grahamstown','King William\'s Town'] },
        ]
      },
      { name: 'Afrikaner/English', weight: 25,
        firstNames: ['Johan','Annemarie','Pieter','Elsa','Hendrik','Marié','Willem','Charlize','Francois','Liesl','Gerhard','Ilse','Andre','Jana','Danie','Suzanne'],
        lastNames: ['Van der Merwe','Botha','Pretorius','Du Plessis','Venter','Joubert','Erasmus','Le Roux','Swanepoel','Potgieter','Coetzee','Nel','Smith','Jones','Williams','Taylor'],
        regions: [
          { state: 'Western Cape', cities: ['Cape Town','Stellenbosch','Paarl','George','Hermanus','Franschhoek','Somerset West'] },
          { state: 'Free State', cities: ['Bloemfontein','Welkom','Kroonstad','Bethlehem'] },
        ]
      },
      { name: 'Indian/Coloured', weight: 25,
        firstNames: ['Rajesh','Priya','Naidoo','Kumari','Devi','Anand','Thalia','Ricardo','Natasha','Brandon','Ashley','Tiffany','Dwayne','Michelle'],
        lastNames: ['Maharaj','Pillay','Naidoo','Govender','Chetty','Reddy','Moodley','Williams','Jacobs','Adams','Abrahams','Hendricks','Petersen','Van Wyk'],
        regions: [
          { state: 'KwaZulu-Natal', cities: ['Durban','Chatsworth','Phoenix','Tongaat','Verulam'] },
          { state: 'Western Cape', cities: ['Cape Town','Athlone','Mitchell\'s Plain','Grassy Park','Woodstock'] },
        ]
      }
    ],
    occupations: ['Accountant','Teacher','Nurse','Engineer','IT Specialist','Marketing Manager','Doctor','Lawyer','Pastor','Mining Engineer','Entrepreneur','Content Creator'],
    companies: ['Sasol','MTN','Vodacom','Standard Bank','FNB','Discovery','Shoprite','Capitec','Old Mutual','Naspers','Takealot'],
    schools: ['UCT','Wits','Stellenbosch','UP','UKZN','UJ','Rhodes','NWU'],
    interests: ['Rugby','Cricket','Gospel Music','Braai','Fashion','Tech','Church','Football','Photography','Hiking','Travel','Kwaito','Wine'],
  },

  Ghana: {
    weight: 1, phonePrefix: '233', phoneLen: 9,
    emailDomains: ['gmail.com','yahoo.com','outlook.com'],
    ethnicGroups: [
      { name: 'Akan', weight: 50,
        firstNames: ['Kwame','Ama','Kofi','Akua','Kwasi','Abena','Yaw','Afua','Kwadwo','Adwoa','Akosua','Nana','Papa','Maame','Serwaa','Afia'],
        lastNames: ['Mensah','Asante','Osei','Boateng','Owusu','Appiah','Bonsu','Amponsah','Badu','Sarpong','Amoako','Frimpong','Acheampong','Ofori','Danquah'],
        regions: [
          { state: 'Ashanti', cities: ['Kumasi','Obuasi','Konongo','Mampong','Ejisu','Bekwai','Offinso'] },
          { state: 'Eastern', cities: ['Koforidua','Nkawkaw','Nsawam','Akuapem','New Juaben'] },
          { state: 'Central', cities: ['Cape Coast','Winneba','Elmina','Dunkwa','Kasoa'] },
        ]
      },
      { name: 'Ga-Adangbe/Ewe', weight: 30,
        firstNames: ['Bright','Mercy','Emmanuel','Grace','Daniel','Esi','Kojo','Efua','Fiifi','Adjoa','Kweku','Aba','Selorm','Dzifa','Edem','Senyo'],
        lastNames: ['Adjei','Tetteh','Amoah','Darko','Agyeman','Quaye','Lamptey','Tagoe','Nartey','Armah','Agbeko','Mensah','Torku','Fiagbe','Tsikata'],
        regions: [
          { state: 'Greater Accra', cities: ['Accra','Tema','Teshie','Madina','Nungua','Dansoman','Adenta','East Legon','Spintex','Osu','La','Labadi'] },
          { state: 'Volta', cities: ['Ho','Keta','Hohoe','Kpando','Aflao','Sogakope'] },
        ]
      },
      { name: 'Northern', weight: 20,
        firstNames: ['Abdul','Amina','Ibrahim','Fatima','Mohammed','Rashida','Sulemana','Abiba','Issah','Mariama','Alhassan','Memunatu','Yakubu','Zenab'],
        lastNames: ['Mohammed','Abdulai','Issahaku','Alhassan','Yakubu','Iddrisu','Salifu','Mahama','Dawuni','Tampuri','Wuni','Sulemana'],
        regions: [
          { state: 'Northern', cities: ['Tamale','Yendi','Savelugu','Damongo'] },
          { state: 'Upper East', cities: ['Bolgatanga','Navrongo','Bawku','Zebilla'] },
          { state: 'Upper West', cities: ['Wa','Tumu','Jirapa','Lawra'] },
        ]
      }
    ],
    occupations: ['Teacher','Trader','Nurse','Software Developer','Banker','Pastor','Civil Servant','Farmer','Engineer','Journalist','Content Creator','Entrepreneur'],
    companies: ['MTN Ghana','Vodafone Ghana','Ecobank','GCB Bank','Stanbic Bank','AirtelTigo','Hubtel','Zeepay','mPharma'],
    schools: ['University of Ghana','KNUST','UCC','Ashesi University','GIMPA','UDS','Academic City'],
    interests: ['Highlife','Football','Church','Cooking','Fashion','Tech','Ministry','Dance','Business','Reading','Jollof','Music','Photography'],
  },

  Kenya: {
    weight: 2, phonePrefix: '254', phoneLen: 9,
    emailDomains: ['gmail.com','yahoo.com','outlook.com'],
    ethnicGroups: [
      { name: 'Kikuyu', weight: 30,
        firstNames: ['James','Faith','Peter','Grace','John','Hope','David','Charity','Samuel','Ruth','Joseph','Esther','Stephen','Naomi','Moses','Sarah'],
        lastNames: ['Kamau','Mwangi','Njoroge','Kimani','Wanjiku','Kariuki','Wambui','Maina','Ngugi','Ndirangu','Gitau','Nyambura','Muiruri','Gacheru'],
        regions: [
          { state: 'Central', cities: ['Nyeri','Murang\'a','Kiambu','Thika','Nanyuki','Karatina','Kerugoya'] },
          { state: 'Nairobi', cities: ['Nairobi','Westlands','Kibera','Karen','Langata','Kasarani','Embakasi','Eastleigh'] },
        ]
      },
      { name: 'Luo', weight: 20,
        firstNames: ['Brian','Mercy','Dennis','Grace','Kevin','Joy','Michael','Angel','Ryan','Peace','Patrick','Vivian','Evans','Lilian'],
        lastNames: ['Odhiambo','Otieno','Ouma','Achieng','Owino','Onyango','Oloo','Okoth','Ogada','Awuor','Akinyi','Odongo','Obiero','Onyango'],
        regions: [
          { state: 'Nyanza', cities: ['Kisumu','Homa Bay','Migori','Siaya','Bondo','Kendu Bay','Ahero'] },
        ]
      },
      { name: 'Kalenjin/Luhya/Others', weight: 50,
        firstNames: ['Kipchoge','Chebet','Kiprono','Jeptoo','Kiplagat','Cherono','Wekesa','Nafula','Barasa','Nekesa','Arap','Chepkoech','Wesley','Vivian','Alex','Beatrice'],
        lastNames: ['Kipchoge','Kiprotich','Koech','Kiptoo','Wafula','Barasa','Wekesa','Mukhwana','Simiyu','Masinde','Mutua','Musyoka','Muthoni','Nyongesa'],
        regions: [
          { state: 'Rift Valley', cities: ['Eldoret','Nakuru','Naivasha','Kericho','Nandi Hills','Kitale','Iten','Kaptagat'] },
          { state: 'Western', cities: ['Kakamega','Bungoma','Busia','Mumias','Webuye'] },
          { state: 'Eastern', cities: ['Machakos','Embu','Meru','Kitui','Makueni'] },
          { state: 'Coast', cities: ['Mombasa','Malindi','Kilifi','Lamu','Watamu','Diani'] },
        ]
      }
    ],
    occupations: ['Teacher','Software Developer','Nurse','Banker','Farmer','Pastor','Business Owner','Engineer','Journalist','Accountant','Content Creator','Humanitarian Worker'],
    companies: ['Safaricom','KCB Bank','Equity Bank','Kenya Airways','M-PESA','Twiga Foods','Andela Kenya','Africa\'s Talking'],
    schools: ['University of Nairobi','Kenyatta University','Strathmore','JKUAT','Moi University','Egerton','Daystar'],
    interests: ['Athletics','Football','Safari','Music','Church','Tech','Business','Cooking','Travel','Photography','Ministry','Marathon Running','Nature'],
  },

  Egypt: {
    weight: 3, phonePrefix: '20', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.com','outlook.com','hotmail.com'],
    ethnicGroups: [
      { name: 'Egyptian Arab', weight: 100,
        firstNames: ['Ahmed','Fatima','Mohamed','Aisha','Omar','Nour','Hassan','Dina','Mahmoud','Sara','Youssef','Mona','Khaled','Heba','Ibrahim','Rania','Amr','Layla','Tamer','Yasmin'],
        lastNames: ['Mohamed','Ali','Hassan','Ibrahim','Mahmoud','Ahmed','Youssef','Abdel','El-Sayed','Farouk','Gamal','Nasser','Said','Osman','Salah','Kamal','Fouad','Helmy'],
        regions: [
          { state: 'Cairo', cities: ['Cairo','Giza','Heliopolis','Nasr City','Maadi','Zamalek','6th October City','New Cairo','Dokki','Mohandessin'] },
          { state: 'Alexandria', cities: ['Alexandria','Borg El Arab','Montaza','Smouha'] },
          { state: 'Dakahlia', cities: ['Mansoura','Talkha','Mit Ghamr'] },
          { state: 'Assiut', cities: ['Assiut','Aswan','Luxor','Qena','Sohag'] },
          { state: 'Sharqia', cities: ['Zagazig','10th of Ramadan','Belbeis'] },
        ]
      }
    ],
    occupations: ['Engineer','Doctor','Teacher','Accountant','Business Owner','Pharmacist','Developer','Marketing','Journalist','Civil Servant','Pastor'],
    companies: ['CIB','Vodafone Egypt','Orange Egypt','Orascom','Elsewedy Electric','Egyptian Banks'],
    schools: ['Cairo University','AUC','Ain Shams University','Alexandria University','GUC'],
    interests: ['Football','Music','Food','Travel','History','Religion','Photography','Social Media','Comedy','Fashion','Church','Cooking'],
  },

  // ============= AMERICAS =============

  'United States': {
    weight: 12,  // 312M
    phonePrefix: '1', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.com','outlook.com','icloud.com','hotmail.com','aol.com'],
    ethnicGroups: [
      { name: 'General American', weight: 60,
        firstNames: ['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Christopher','Susan','Daniel','Jessica','Matthew','Sarah','Anthony','Karen','Andrew','Emily','Mark','Megan','Steven','Ashley','Joshua','Samantha','Tyler','Lauren'],
        lastNames: ['Smith','Johnson','Williams','Brown','Jones','Miller','Davis','Wilson','Anderson','Taylor','Thomas','Moore','Jackson','Martin','Lee','Thompson','White','Harris','Clark','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Hill','Green','Adams'],
        regions: [
          { state: 'California', cities: ['Los Angeles','San Francisco','San Diego','San Jose','Sacramento','Oakland','Fresno','Long Beach','Irvine','Pasadena','Santa Monica','Berkeley'] },
          { state: 'New York', cities: ['New York City','Brooklyn','Queens','Manhattan','Bronx','Buffalo','Albany','Rochester','Syracuse'] },
          { state: 'Texas', cities: ['Houston','Dallas','Austin','San Antonio','Fort Worth','El Paso','Plano','Arlington','Frisco'] },
          { state: 'Florida', cities: ['Miami','Orlando','Tampa','Jacksonville','Fort Lauderdale','St. Petersburg','Tallahassee'] },
          { state: 'Illinois', cities: ['Chicago','Naperville','Aurora','Rockford','Joliet','Evanston'] },
          { state: 'Washington', cities: ['Seattle','Bellevue','Tacoma','Spokane','Redmond','Kirkland'] },
          { state: 'Georgia', cities: ['Atlanta','Savannah','Augusta','Columbus','Marietta','Decatur'] },
          { state: 'Pennsylvania', cities: ['Philadelphia','Pittsburgh','Allentown','Erie','Reading'] },
          { state: 'Massachusetts', cities: ['Boston','Cambridge','Worcester','Springfield','Lowell'] },
          { state: 'Colorado', cities: ['Denver','Colorado Springs','Aurora','Boulder','Fort Collins'] },
        ]
      },
      { name: 'African American', weight: 15,
        firstNames: ['DeAndre','Aaliyah','Jamal','Imani','Tyrone','Keisha','Darnell','Latoya','Marcus','Ebony','Terrell','Shaniqua','Andre','Monique','Dante','Jasmine','Malik','Tasha','Xavier','Beyonce'],
        lastNames: ['Washington','Jefferson','Jackson','Robinson','Harris','Brooks','Coleman','Howard','Bell','Reed','Butler','Bailey','Price','Ross','Sanders','Mitchell','Griffin','Turner','Stewart','Carter'],
        regions: [
          { state: 'Georgia', cities: ['Atlanta','Decatur','College Park','East Point','Lithonia','Stone Mountain'] },
          { state: 'Maryland', cities: ['Baltimore','Silver Spring','Bowie','Columbia','Laurel'] },
          { state: 'Illinois', cities: ['Chicago','Harvey','Maywood','Calumet City'] },
          { state: 'Louisiana', cities: ['New Orleans','Baton Rouge','Shreveport','Monroe'] },
          { state: 'North Carolina', cities: ['Charlotte','Durham','Raleigh','Greensboro','Winston-Salem'] },
        ]
      },
      { name: 'Hispanic American', weight: 20,
        firstNames: ['Carlos','Maria','Miguel','Sofia','Diego','Isabella','Jose','Valentina','Luis','Camila','Juan','Lucia','Alejandro','Gabriela','Ricardo','Elena','Fernando','Andrea','Pedro','Carmen'],
        lastNames: ['Garcia','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Perez','Sanchez','Ramirez','Torres','Flores','Rivera','Gomez','Diaz','Cruz','Reyes','Morales','Ortiz','Gutierrez','Chavez'],
        regions: [
          { state: 'California', cities: ['Los Angeles','San Diego','San Jose','Fresno','Bakersfield','Riverside','Santa Ana','Oxnard'] },
          { state: 'Texas', cities: ['Houston','San Antonio','El Paso','Dallas','Laredo','McAllen','Brownsville','Corpus Christi'] },
          { state: 'Florida', cities: ['Miami','Hialeah','Orlando','Tampa','Kissimmee','Homestead'] },
          { state: 'Arizona', cities: ['Phoenix','Tucson','Mesa','Chandler','Tempe','Glendale'] },
          { state: 'New York', cities: ['New York City','The Bronx','Queens','Yonkers'] },
        ]
      },
      { name: 'Asian American', weight: 5,
        firstNames: ['Kevin','Grace','Brian','Michelle','Jason','Christine','Eric','Amy','Andrew','Jessica','Ryan','Jennifer','Daniel','Lisa','Steven','Karen'],
        lastNames: ['Wang','Chen','Liu','Kim','Lee','Park','Patel','Nguyen','Tran','Chang','Wu','Lin','Yang','Huang','Wong','Cho','Tanaka','Suzuki'],
        regions: [
          { state: 'California', cities: ['San Francisco','San Jose','Fremont','Cupertino','Arcadia','Irvine','Alhambra','Daly City'] },
          { state: 'New York', cities: ['New York City','Flushing','Chinatown','Elmhurst'] },
          { state: 'Washington', cities: ['Seattle','Bellevue','Redmond','Federal Way'] },
          { state: 'New Jersey', cities: ['Edison','Jersey City','Fort Lee','Palisades Park'] },
        ]
      },
    ],
    occupations: ['Software Engineer','Marketing Manager','Teacher','Nurse','Data Analyst','Product Manager','Designer','Writer','Consultant','Pastor','Entrepreneur','Doctor','Lawyer','Financial Advisor','Content Creator','Freelancer'],
    companies: ['Google','Apple','Amazon','Microsoft','Meta','Netflix','Tesla','Salesforce','Uber','Airbnb','JPMorgan','Goldman Sachs','Disney','Nike','Walmart'],
    schools: ['MIT','Stanford','Harvard','UC Berkeley','UT Austin','UCLA','Columbia','NYU','Georgia Tech','Michigan','UW','CMU','Duke','Yale','Princeton'],
    interests: ['Tech','Sports','Music','Travel','Fitness','Gaming','Photography','Cooking','Reading','Movies','Church','Podcasts','Hiking','Yoga','Art','Crypto','Social Media'],
  },

  Brazil: {
    weight: 7,  // 181M
    phonePrefix: '55', phoneLen: 11,
    emailDomains: ['gmail.com','yahoo.com.br','outlook.com','hotmail.com','uol.com.br','bol.com.br'],
    ethnicGroups: [
      { name: 'Brazilian', weight: 100,
        firstNames: ['Lucas','Ana','Gabriel','Maria','Mateus','Julia','Rafael','Beatriz','Gustavo','Larissa','Pedro','Fernanda','Felipe','Camila','Bruno','Isabela','Diego','Leticia','Thiago','Amanda','Vinicius','Carolina','Guilherme','Mariana','Arthur','Bruna'],
        lastNames: ['Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Costa','Pereira','Carvalho','Gomes','Martins','Araujo','Ribeiro','Almeida','Nascimento','Lima','Barbosa','Rocha','Teixeira','Moreira','Cardoso','Pinto','Correia','Dias'],
        regions: [
          { state: 'São Paulo', cities: ['São Paulo','Campinas','Santos','Guarulhos','São Bernardo','Osasco','Ribeirão Preto','Sorocaba'] },
          { state: 'Rio de Janeiro', cities: ['Rio de Janeiro','Niterói','São Gonçalo','Duque de Caxias','Nova Iguaçu','Petrópolis'] },
          { state: 'Minas Gerais', cities: ['Belo Horizonte','Uberlândia','Juiz de Fora','Contagem','Ouro Preto'] },
          { state: 'Bahia', cities: ['Salvador','Feira de Santana','Vitória da Conquista','Ilhéus','Itabuna'] },
          { state: 'Rio Grande do Sul', cities: ['Porto Alegre','Caxias do Sul','Pelotas','Canoas','Gramado'] },
          { state: 'Paraná', cities: ['Curitiba','Londrina','Maringá','Foz do Iguaçu','Cascavel'] },
          { state: 'Pernambuco', cities: ['Recife','Olinda','Jaboatão','Caruaru','Petrolina'] },
          { state: 'Ceará', cities: ['Fortaleza','Caucaia','Juazeiro do Norte','Sobral'] },
          { state: 'Distrito Federal', cities: ['Brasília','Taguatinga','Ceilândia','Lago Sul'] },
        ]
      }
    ],
    occupations: ['Engineer','Teacher','Business Owner','Developer','Doctor','Nurse','Accountant','Marketing','Pastor','Designer','Journalist','Content Creator','Freelancer'],
    companies: ['Petrobras','Itaú','Bradesco','Nubank','Magazine Luiza','Ambev','Natura','iFood','Mercado Livre','Vale','B3','Stone','PagSeguro'],
    schools: ['USP','UNICAMP','UFRJ','PUC','FGV','UFMG','UFRGS','Mackenzie','Insper'],
    interests: ['Football','Samba','Beach','Carnival','Music','Church','BBQ','Dance','Surfing','Travel','Photography','Fitness','MMA','Social Media','Fashion'],
  },

  Mexico: {
    weight: 4, phonePrefix: '52', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.com.mx','outlook.com','hotmail.com'],
    ethnicGroups: [
      { name: 'Mexican', weight: 100,
        firstNames: ['Diego','Sofia','Santiago','Valentina','Mateo','Camila','Sebastian','Fernanda','Leonardo','Regina','Emiliano','Mariana','Daniel','Andrea','Miguel','Alejandra','Jorge','Daniela','Carlos','Paula'],
        lastNames: ['García','Hernández','López','Martínez','González','Rodríguez','Pérez','Sánchez','Ramírez','Torres','Flores','Rivera','Gómez','Díaz','Cruz','Reyes','Morales','Ortiz','Gutiérrez','Mendoza'],
        regions: [
          { state: 'Mexico City', cities: ['Mexico City','Coyoacán','Tlalpan','Iztapalapa','Álvaro Obregón','Benito Juárez'] },
          { state: 'Jalisco', cities: ['Guadalajara','Zapopan','Tlaquepaque','Puerto Vallarta','Tonalá'] },
          { state: 'Nuevo León', cities: ['Monterrey','San Pedro','San Nicolás','Guadalupe','Apodaca'] },
          { state: 'Estado de Mexico', cities: ['Toluca','Naucalpan','Ecatepec','Nezahualcóyotl','Tlalnepantla'] },
          { state: 'Puebla', cities: ['Puebla','Cholula','Atlixco','Tehuacán'] },
          { state: 'Quintana Roo', cities: ['Cancún','Playa del Carmen','Tulum','Chetumal'] },
          { state: 'Yucatan', cities: ['Mérida','Valladolid','Progreso','Tizimín'] },
        ]
      }
    ],
    occupations: ['Engineer','Teacher','Doctor','Business Owner','Developer','Accountant','Marketing','Nurse','Architect','Designer','Chef','Lawyer','Content Creator'],
    companies: ['América Móvil','Cemex','Femsa','Bimbo','Banorte','Televisa','Volaris','Liverpool','Rappi México'],
    schools: ['UNAM','Tec de Monterrey','ITAM','IPN','UDG','UDLAP','Ibero','Anáhuac'],
    interests: ['Football','Music','Food','Tacos','Travel','Church','Family','Dance','Photography','Art','History','Movies','Gaming','Social Media'],
  },

  // ============= EUROPE =============

  'United Kingdom': {
    weight: 3, phonePrefix: '44', phoneLen: 10,
    emailDomains: ['gmail.com','yahoo.co.uk','outlook.com','btinternet.com','hotmail.co.uk','icloud.com'],
    ethnicGroups: [
      { name: 'British', weight: 85,
        firstNames: ['Oliver','Amelia','Harry','Isla','George','Ava','Noah','Mia','Jack','Emily','Leo','Sophie','Oscar','Grace','Charlie','Lily','Freddie','Chloe','Alfie','Ella','Thomas','Charlotte','James','Daisy','William','Poppy'],
        lastNames: ['Smith','Jones','Williams','Taylor','Brown','Davies','Evans','Wilson','Thomas','Roberts','Johnson','Lewis','Walker','Robinson','Wood','Thompson','White','Watson','Jackson','Wright','Clarke','Hughes','Green','Edwards','Hall','Turner','Scott','Morris','Ward','Cook'],
        regions: [
          { state: 'Greater London', cities: ['London','Camden','Hackney','Islington','Kensington','Westminster','Brixton','Shoreditch','Greenwich','Richmond','Croydon','Bromley','Stratford'] },
          { state: 'Greater Manchester', cities: ['Manchester','Salford','Stockport','Bolton','Oldham','Rochdale','Wigan'] },
          { state: 'West Midlands', cities: ['Birmingham','Wolverhampton','Coventry','Solihull','Dudley','Walsall'] },
          { state: 'West Yorkshire', cities: ['Leeds','Bradford','Huddersfield','Wakefield','Halifax'] },
          { state: 'Merseyside', cities: ['Liverpool','Birkenhead','St Helens','Southport'] },
          { state: 'South East', cities: ['Brighton','Oxford','Reading','Southampton','Portsmouth','Canterbury','Guildford'] },
          { state: 'Scotland', cities: ['Edinburgh','Glasgow','Aberdeen','Dundee','Stirling','Inverness'] },
          { state: 'Wales', cities: ['Cardiff','Swansea','Newport','Bangor','Wrexham'] },
        ]
      },
      { name: 'British Asian', weight: 10,
        firstNames: ['Zain','Aisha','Ali','Fatima','Imran','Nadia','Hamza','Sara','Rizwan','Hira','Adnan','Sana','Faisal','Zara'],
        lastNames: ['Khan','Patel','Singh','Ahmed','Hussain','Ali','Shah','Iqbal','Malik','Begum','Rahman','Chowdhury'],
        regions: [
          { state: 'West Midlands', cities: ['Birmingham','Leicester','Wolverhampton'] },
          { state: 'Greater London', cities: ['London','Tower Hamlets','Newham','Southall','Wembley'] },
          { state: 'West Yorkshire', cities: ['Bradford','Leeds','Dewsbury'] },
          { state: 'Greater Manchester', cities: ['Manchester','Oldham','Rochdale'] },
        ]
      },
      { name: 'Black British', weight: 5,
        firstNames: ['Kwame','Ama','Kofi','Abena','Emmanuel','Grace','David','Mercy','Daniel','Faith','Samuel','Joy','Michael','Peace'],
        lastNames: ['Mensah','Asante','Osei','Adjei','Williams','Johnson','Brown','Campbell','Gordon','Taylor','Thomas','Francis','Henry','Lewis'],
        regions: [
          { state: 'Greater London', cities: ['London','Brixton','Peckham','Tottenham','Lewisham','Croydon','Hackney'] },
          { state: 'West Midlands', cities: ['Birmingham','Wolverhampton','Coventry'] },
          { state: 'Greater Manchester', cities: ['Manchester','Moss Side'] },
        ]
      }
    ],
    occupations: ['Software Developer','Marketing Executive','Teacher','Nurse','Accountant','Consultant','Designer','Writer','Data Analyst','Project Manager','Pastor','Entrepreneur','Doctor','Lawyer'],
    companies: ['HSBC','Barclays','BBC','Tesco','BP','Unilever','GlaxoSmithKline','Vodafone','BT Group','Revolut','Wise','Deliveroo','Sky'],
    schools: ['Oxford','Cambridge','Imperial','UCL','King\'s College','Edinburgh','Manchester','Bristol','Warwick','LSE','Durham','St Andrews'],
    interests: ['Football','Tea','Travel','Music','Theatre','Reading','Cooking','Gardening','Cycling','Church','Photography','History','Pub Culture','Comedy','Fitness'],
  },

  Germany: {
    weight: 3, phonePrefix: '49', phoneLen: 11,
    emailDomains: ['gmail.com','gmx.de','web.de','outlook.com','t-online.de'],
    ethnicGroups: [
      { name: 'German', weight: 100,
        firstNames: ['Max','Sophie','Leon','Emma','Lukas','Mia','Paul','Hannah','Felix','Lena','Jonas','Laura','Tim','Sarah','David','Lisa','Elias','Marie','Noah','Lea','Finn','Johanna','Ben','Anna','Moritz','Julia'],
        lastNames: ['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Hoffmann','Koch','Richter','Klein','Wolf','Schröder','Braun','Zimmermann','Krüger','Werner','Lange','Hartmann'],
        regions: [
          { state: 'Bavaria', cities: ['Munich','Nuremberg','Augsburg','Regensburg','Ingolstadt','Würzburg','Erlangen'] },
          { state: 'Berlin', cities: ['Berlin','Kreuzberg','Neukölln','Mitte','Prenzlauer Berg','Charlottenburg','Friedrichshain'] },
          { state: 'NRW', cities: ['Cologne','Düsseldorf','Dortmund','Essen','Bonn','Münster','Bielefeld','Aachen'] },
          { state: 'Baden-Württemberg', cities: ['Stuttgart','Karlsruhe','Mannheim','Freiburg','Heidelberg','Tübingen'] },
          { state: 'Hesse', cities: ['Frankfurt','Wiesbaden','Darmstadt','Kassel','Offenbach'] },
          { state: 'Saxony', cities: ['Dresden','Leipzig','Chemnitz'] },
          { state: 'Hamburg', cities: ['Hamburg'] },
          { state: 'Lower Saxony', cities: ['Hannover','Braunschweig','Oldenburg','Osnabrück','Wolfsburg','Göttingen'] },
        ]
      }
    ],
    occupations: ['Engineer','Developer','Teacher','Doctor','Researcher','Manager','Designer','Consultant','Mechanic','Nurse','Accountant','Content Creator'],
    companies: ['Siemens','BMW','SAP','Allianz','Deutsche Bank','Bosch','Volkswagen','Bayer','BASF','Adidas','Daimler','Deutsche Telekom','Delivery Hero'],
    schools: ['TU Munich','Humboldt','LMU Munich','Heidelberg','RWTH Aachen','FU Berlin','TU Berlin','Göttingen'],
    interests: ['Football','Beer','Travel','Music','Engineering','Hiking','Cycling','Church','Reading','Photography','Cars','Nature','Cooking','History','Fitness'],
  },

  France: {
    weight: 2, phonePrefix: '33', phoneLen: 9,
    emailDomains: ['gmail.com','yahoo.fr','orange.fr','outlook.fr','hotmail.fr','free.fr'],
    ethnicGroups: [
      { name: 'French', weight: 100,
        firstNames: ['Lucas','Emma','Hugo','Jade','Louis','Léa','Gabriel','Chloé','Raphaël','Alice','Arthur','Manon','Jules','Camille','Adam','Inès','Nathan','Louise','Tom','Léna','Noah','Sarah','Liam','Anna','Ethan','Lola'],
        lastNames: ['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier'],
        regions: [
          { state: 'Île-de-France', cities: ['Paris','Boulogne-Billancourt','Saint-Denis','Versailles','Montreuil','Nanterre','Créteil'] },
          { state: 'Provence-Alpes', cities: ['Marseille','Nice','Toulon','Aix-en-Provence','Avignon','Cannes','Antibes'] },
          { state: 'Auvergne-Rhône-Alpes', cities: ['Lyon','Grenoble','Saint-Étienne','Clermont-Ferrand','Annecy','Villeurbanne'] },
          { state: 'Occitanie', cities: ['Toulouse','Montpellier','Nîmes','Perpignan','Béziers'] },
          { state: 'Nouvelle-Aquitaine', cities: ['Bordeaux','Limoges','Poitiers','Pau','La Rochelle'] },
          { state: 'Brittany', cities: ['Rennes','Brest','Quimper','Lorient','Vannes','Saint-Malo'] },
        ]
      }
    ],
    occupations: ['Engineer','Designer','Chef','Teacher','Developer','Manager','Writer','Artist','Doctor','Researcher','Marketing','Content Creator','Consultant'],
    companies: ['LVMH','TotalEnergies','L\'Oréal','BNP Paribas','Airbus','Renault','Orange','Capgemini','Dassault','Michelin','Saint-Gobain'],
    schools: ['Sorbonne','Polytechnique','HEC','Sciences Po','ENS','CentraleSupélec','ESSEC','Mines ParisTech'],
    interests: ['Wine','Art','Cinema','Cooking','Fashion','Football','Travel','Literature','Music','Photography','Philosophy','Cycling','Cheese','Church'],
  },

  Russia: {
    weight: 5, phonePrefix: '7', phoneLen: 10,
    emailDomains: ['gmail.com','mail.ru','yandex.ru','outlook.com','rambler.ru'],
    ethnicGroups: [
      { name: 'Russian', weight: 100,
        firstNames: ['Alexander','Anastasia','Dmitry','Ekaterina','Ivan','Maria','Andrei','Olga','Mikhail','Tatiana','Sergei','Elena','Nikolai','Anna','Pavel','Natalia','Alexei','Irina','Vladimir','Yulia'],
        lastNames: ['Ivanov','Smirnov','Kuznetsov','Popov','Sokolov','Lebedev','Kozlov','Novikov','Morozov','Petrov','Volkov','Solovyov','Vasiliev','Zaytsev','Pavlov','Semyonov','Golubev','Vinogradov'],
        regions: [
          { state: 'Moscow', cities: ['Moscow','Khimki','Balashikha','Podolsk','Mytishchi','Odintsovo'] },
          { state: 'Saint Petersburg', cities: ['Saint Petersburg','Petrogradsky','Kolpino','Pushkin','Kronstadt'] },
          { state: 'Sverdlovsk', cities: ['Yekaterinburg','Nizhny Tagil','Kamensk-Uralsky'] },
          { state: 'Novosibirsk', cities: ['Novosibirsk','Berdsk','Akademgorodok'] },
          { state: 'Tatarstan', cities: ['Kazan','Naberezhnye Chelny','Nizhnekamsk'] },
          { state: 'Krasnodar', cities: ['Krasnodar','Sochi','Novorossiysk','Anapa'] },
        ]
      }
    ],
    occupations: ['Engineer','Doctor','Teacher','IT Specialist','Manager','Accountant','Programmer','Designer','Nurse','Scientist','Business Owner','Lawyer'],
    companies: ['Yandex','Sberbank','Gazprom','Lukoil','VK','Kaspersky','Wildberries','Ozon','Tinkoff','Mail.ru Group'],
    schools: ['Moscow State University','SPbU','MIPT','ITMO','Bauman','HSE','Novosibirsk State University'],
    interests: ['Tech','Literature','Music','Hockey','Football','Chess','Nature','Photography','Cinema','Travel','History','Gaming','Cooking','Art'],
  },

  Turkey: {
    weight: 3, phonePrefix: '90', phoneLen: 10,
    emailDomains: ['gmail.com','hotmail.com','outlook.com','yahoo.com'],
    ethnicGroups: [
      { name: 'Turkish', weight: 100,
        firstNames: ['Mehmet','Zeynep','Ali','Elif','Mustafa','Defne','Ahmet','Ecrin','Emir','Ayşe','Yusuf','Fatma','Murat','Merve','Ömer','Selin','Burak','Buse','Can','Nazlı'],
        lastNames: ['Yılmaz','Kaya','Demir','Çelik','Şahin','Öztürk','Aydın','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özdemir','Yıldırım','Erdoğan','Polat','Özkan'],
        regions: [
          { state: 'Istanbul', cities: ['Istanbul','Kadıköy','Beşiktaş','Şişli','Üsküdar','Bakırköy','Beyoğlu','Sarıyer','Fatih','Ataşehir'] },
          { state: 'Ankara', cities: ['Ankara','Çankaya','Keçiören','Yenimahalle','Mamak'] },
          { state: 'Izmir', cities: ['Izmir','Bornova','Karşıyaka','Buca','Konak','Alsancak'] },
          { state: 'Antalya', cities: ['Antalya','Alanya','Manavgat','Kemer','Side'] },
          { state: 'Bursa', cities: ['Bursa','Nilüfer','Osmangazi','Yıldırım'] },
        ]
      }
    ],
    occupations: ['Engineer','Teacher','Doctor','Business Owner','Developer','Marketing','Accountant','Architect','Lawyer','Designer','Chef','Content Creator'],
    companies: ['Koç Holding','Sabancı','Turkcell','THY','Garanti BBVA','Trendyol','Getir','BIM','Hepsiburada'],
    schools: ['Boğaziçi','METU','Bilkent','İTÜ','Koç University','Sabancı University','Hacettepe','İstanbul University'],
    interests: ['Football','Tea','Food','Travel','Music','History','Photography','Social Media','Gaming','Fashion','Cooking','Family','Church','Chess'],
  },

  // ============= MIDDLE EAST =============

  'Saudi Arabia': {
    weight: 1, phonePrefix: '966', phoneLen: 9,
    emailDomains: ['gmail.com','hotmail.com','outlook.com','yahoo.com'],
    ethnicGroups: [
      { name: 'Saudi', weight: 100,
        firstNames: ['Mohammed','Fatima','Abdullah','Noura','Khalid','Sara','Faisal','Lama','Ahmed','Reem','Sultan','Haya','Omar','Noof','Turki','Dana','Fahad','Maha','Saad','Abeer'],
        lastNames: ['Al-Saud','Al-Rashid','Al-Otaibi','Al-Ghamdi','Al-Qahtani','Al-Dosari','Al-Harbi','Al-Maliki','Al-Zahrani','Al-Shehri','Al-Mutairi','Al-Anazi','Al-Subaie','Al-Tamimi'],
        regions: [
          { state: 'Riyadh', cities: ['Riyadh','Diriyah','Al Kharj','Dawadmi'] },
          { state: 'Makkah', cities: ['Jeddah','Mecca','Taif','Rabigh'] },
          { state: 'Eastern Province', cities: ['Dammam','Dhahran','Al Khobar','Jubail','Hafar Al-Batin'] },
          { state: 'Madinah', cities: ['Medina','Yanbu','Al Ula'] },
        ]
      }
    ],
    occupations: ['Engineer','Doctor','Business Owner','Government Employee','Teacher','Banker','IT Professional','Marketing','Entrepreneur'],
    companies: ['Saudi Aramco','SABIC','STC','Al Rajhi Bank','Saudi Airlines','Jarir','NEOM','Noon'],
    schools: ['King Saud University','KAUST','King Fahd University','Effat University','Prince Sultan University'],
    interests: ['Football','Travel','Food','Cars','Technology','Photography','Business','Religion','Family','Gaming','Social Media','Fashion'],
  },

  UAE: {
    weight: 1, phonePrefix: '971', phoneLen: 9,
    emailDomains: ['gmail.com','outlook.com','hotmail.com','yahoo.com'],
    ethnicGroups: [
      { name: 'Emirati & Expat', weight: 100,
        firstNames: ['Ahmed','Mariam','Mohammed','Fatima','Khalid','Latifa','Omar','Sheikha','Ali','Hind','Hassan','Noura','Rashid','Aisha','Saeed','Moza','Yousef','Reem','Hamad','Sara'],
        lastNames: ['Al Maktoum','Al Nahyan','Al Falasi','Al Shamsi','Al Nuaimi','Al Zaabi','Al Balooshi','Al Mulla','Al Hashmi','Al Suwaidi','Al Kaabi','Al Mazrouei','Al Qasimi'],
        regions: [
          { state: 'Dubai', cities: ['Dubai','Dubai Marina','JBR','Downtown Dubai','Deira','Bur Dubai','Jumeirah','Business Bay'] },
          { state: 'Abu Dhabi', cities: ['Abu Dhabi','Al Ain','Yas Island','Saadiyat Island','Khalifa City'] },
          { state: 'Sharjah', cities: ['Sharjah','Al Nahda','Al Qasimia','Al Taawun'] },
        ]
      }
    ],
    occupations: ['Engineer','Marketing Manager','Business Owner','IT Professional','Doctor','Teacher','Finance Professional','HR Manager','Designer','Consultant'],
    companies: ['Emirates','Etisalat','ADNOC','Dubai Holdings','Emaar','Careem','Noon','Talabat','Majid Al Futtaim'],
    schools: ['NYU Abu Dhabi','American University of Sharjah','UAE University','Khalifa University','UOWD'],
    interests: ['Travel','Luxury','Food','Photography','Business','Football','Fashion','Cars','Tech','Social Media','Beach','Shopping','Fitness'],
  },

  // ============= OCEANIA =============

  Australia: {
    weight: 1, phonePrefix: '61', phoneLen: 9,
    emailDomains: ['gmail.com','yahoo.com.au','outlook.com','icloud.com','bigpond.com'],
    ethnicGroups: [
      { name: 'Australian', weight: 100,
        firstNames: ['Jack','Charlotte','Oliver','Olivia','William','Amelia','Noah','Isla','Thomas','Ava','James','Mia','Ethan','Grace','Lucas','Chloe','Henry','Sophie','Liam','Emily','Mason','Zoe','Cooper','Ella','Archer','Ruby'],
        lastNames: ['Smith','Jones','Williams','Brown','Wilson','Taylor','Johnson','White','Martin','Anderson','Thompson','Walker','Harris','Lee','Ryan','Robinson','Kelly','King','Campbell','Young','Clark','Allen','Wright','Hall'],
        regions: [
          { state: 'NSW', cities: ['Sydney','Parramatta','Newcastle','Wollongong','Bondi','Manly','Surry Hills','Newtown','Coogee'] },
          { state: 'Victoria', cities: ['Melbourne','Geelong','Ballarat','Bendigo','St Kilda','Richmond','Fitzroy','Carlton'] },
          { state: 'Queensland', cities: ['Brisbane','Gold Coast','Cairns','Townsville','Sunshine Coast','Noosa','Toowoomba'] },
          { state: 'Western Australia', cities: ['Perth','Fremantle','Mandurah','Bunbury','Geraldton'] },
          { state: 'South Australia', cities: ['Adelaide','Mount Gambier','Glenelg','Victor Harbor'] },
          { state: 'ACT', cities: ['Canberra','Woden','Belconnen','Tuggeranong'] },
        ]
      }
    ],
    occupations: ['Software Engineer','Teacher','Nurse','Accountant','Tradie','Marketing Manager','Doctor','Mining Engineer','Chef','Designer','Content Creator','Consultant'],
    companies: ['BHP','CBA','Woolworths','Telstra','Rio Tinto','NAB','Qantas','Atlassian','Canva','Afterpay','Xero','CSL'],
    schools: ['Melbourne','Sydney','UNSW','ANU','Monash','UQ','UWA','Adelaide','Macquarie','RMIT','UTS'],
    interests: ['AFL','Cricket','Surfing','BBQ','Travel','Bush Walking','Coffee','Beach','Music','Church','Rugby','Photography','Wine','Hiking','Fitness'],
  },
};

// ==========================================
// DIASPORA CONFIG
// Where people emigrate to (5-10% chance)
// ==========================================
const DIASPORA_MAP = {
  Nigeria: [
    { dest: 'United States', prob: 0.03, cities: ['Houston','New York City','Atlanta','Chicago','Dallas'] },
    { dest: 'United Kingdom', prob: 0.04, cities: ['London','Manchester','Birmingham'] },
    { dest: 'Canada', prob: 0.01, cities: ['Toronto','Calgary','Ottawa'] },
    { dest: 'South Africa', prob: 0.01, cities: ['Johannesburg','Cape Town'] },
    { dest: 'UAE', prob: 0.01, cities: ['Dubai','Abu Dhabi'] },
  ],
  India: [
    { dest: 'United States', prob: 0.04, cities: ['San Jose','San Francisco','New York City','Chicago','Houston','Seattle'] },
    { dest: 'United Kingdom', prob: 0.03, cities: ['London','Leicester','Birmingham','Manchester'] },
    { dest: 'UAE', prob: 0.03, cities: ['Dubai','Abu Dhabi','Sharjah'] },
    { dest: 'Saudi Arabia', prob: 0.01, cities: ['Riyadh','Jeddah','Dammam'] },
    { dest: 'Australia', prob: 0.01, cities: ['Sydney','Melbourne','Brisbane'] },
  ],
  Philippines: [
    { dest: 'United States', prob: 0.04, cities: ['Los Angeles','San Francisco','New York City','Chicago','Honolulu'] },
    { dest: 'UAE', prob: 0.03, cities: ['Dubai','Abu Dhabi'] },
    { dest: 'Saudi Arabia', prob: 0.02, cities: ['Riyadh','Jeddah'] },
    { dest: 'United Kingdom', prob: 0.01, cities: ['London'] },
  ],
  Ghana: [
    { dest: 'United States', prob: 0.02, cities: ['New York City','Chicago','Houston'] },
    { dest: 'United Kingdom', prob: 0.03, cities: ['London','Manchester','Birmingham'] },
    { dest: 'Germany', prob: 0.01, cities: ['Hamburg','Berlin','Düsseldorf'] },
  ],
  Kenya: [
    { dest: 'United States', prob: 0.02, cities: ['Dallas','Houston','Atlanta','Minneapolis'] },
    { dest: 'United Kingdom', prob: 0.02, cities: ['London','Manchester'] },
    { dest: 'UAE', prob: 0.01, cities: ['Dubai'] },
  ],
  Pakistan: [
    { dest: 'United Kingdom', prob: 0.04, cities: ['London','Birmingham','Bradford','Manchester'] },
    { dest: 'UAE', prob: 0.03, cities: ['Dubai','Abu Dhabi','Sharjah'] },
    { dest: 'Saudi Arabia', prob: 0.02, cities: ['Riyadh','Jeddah'] },
    { dest: 'United States', prob: 0.01, cities: ['New York City','Houston','Chicago'] },
  ],
  Bangladesh: [
    { dest: 'United Kingdom', prob: 0.03, cities: ['London','Birmingham','Manchester'] },
    { dest: 'UAE', prob: 0.02, cities: ['Dubai'] },
    { dest: 'Saudi Arabia', prob: 0.02, cities: ['Riyadh','Jeddah'] },
  ],
  'South Africa': [
    { dest: 'United Kingdom', prob: 0.03, cities: ['London','Manchester','Edinburgh'] },
    { dest: 'Australia', prob: 0.02, cities: ['Perth','Sydney','Melbourne'] },
    { dest: 'United States', prob: 0.01, cities: ['Atlanta','New York City'] },
  ],
  Brazil: [
    { dest: 'United States', prob: 0.03, cities: ['Miami','Orlando','New York City','Boston'] },
    { dest: 'United Kingdom', prob: 0.01, cities: ['London'] },
    { dest: 'Japan', prob: 0.01, cities: ['Tokyo','Nagoya'] },
  ],
  China: [
    { dest: 'United States', prob: 0.02, cities: ['San Francisco','New York City','Los Angeles','Seattle'] },
    { dest: 'Australia', prob: 0.01, cities: ['Sydney','Melbourne'] },
    { dest: 'United Kingdom', prob: 0.01, cities: ['London','Manchester'] },
    { dest: 'Japan', prob: 0.01, cities: ['Tokyo','Osaka'] },
  ],
  Egypt: [
    { dest: 'UAE', prob: 0.03, cities: ['Dubai','Abu Dhabi'] },
    { dest: 'Saudi Arabia', prob: 0.02, cities: ['Riyadh','Jeddah'] },
    { dest: 'United Kingdom', prob: 0.01, cities: ['London'] },
  ],
};

// ==========================================
// BIO TEMPLATES
// ==========================================
const BIO_TEMPLATES = [
  "{occupation} based in {city}, {country}. {interest1} enthusiast.",
  "Living in {city} 🌍 | {occupation} | Love {interest1} & {interest2}",
  "{occupation} | {city}, {country} | Passionate about {interest1}",
  "🙏 Believer | {occupation} | {city} | {interest1} lover",
  "{interest1} | {interest2} | {interest3} | Based in {city}",
  "Just a {occupation} who loves {interest1} and {interest2} ✨",
  "{city} 📍 | {occupation} | Making the world better one day at a time",
  "Content creator from {city}. Sharing my journey in {interest1}.",
  "📚 {interest1} | 🎵 {interest2} | 💼 {occupation} | 📍 {city}",
  "Faith. Family. {interest1}. | {occupation} in {city}",
  "Building cool stuff at {company} | {city} | {interest1}",
  "{occupation} @{company} | {interest1} & {interest2} | {city}",
  "Dreamer. Doer. {occupation}. Living in beautiful {city}.",
  "God first 🙏 | {occupation} | {city}, {country}",
  "Proudly representing {city} 🏠 | {occupation} | {interest1}",
];

const ABOUT_TEMPLATES = [
  "I'm a passionate {occupation} based in {city}, {country}. When I'm not working, you'll find me exploring {interest1} or catching up on {interest2}. I believe in making a positive impact in my community.",
  "Hey there! I'm from {city} and I work as a {occupation}. I graduated from {school} and have been on an incredible journey since. My passions include {interest1}, {interest2}, and {interest3}.",
  "Born and raised in {hometown}. Currently working as a {occupation} in {city}. I'm deeply passionate about {interest1} and spend my weekends exploring {interest2}.",
  "Professional {occupation} with experience in the field. Based in {city}. Always looking to learn new things. My interests include {interest1}, {interest2}, and {interest3}.",
];

const GENDERS = ['male', 'female'];
const RELATIONSHIP_STATUSES = ['single', 'in_relationship', 'married', 'prefer_not_to_say', ''];
const LANGUAGES_POOL = ['English','French','Spanish','Portuguese','Arabic','Mandarin','Hindi','Swahili','German','Japanese','Korean','Yoruba','Igbo','Hausa','Twi','Zulu','Xhosa','Tagalog','Indonesian','Vietnamese','Thai','Turkish','Russian','Bengali','Urdu','Persian','Italian','Dutch','Polish','Swedish'];
const SKILLS_POOL = ['Writing','Photography','Video Editing','Public Speaking','Leadership','Music','Graphic Design','Social Media','Marketing','Coding','Teaching','Counseling','Event Planning','Web Development','Data Analysis','Project Management','Content Creation','Worship Leading','Singing','Dancing','Acting','Cooking','Sports Coaching','Financial Planning','Community Building'];

// ==========================================
// GENERATOR CLASS V2
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
  _pickN(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length)); }
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
      () => `${fl}${ll[0]}${this._rand(10, 9999)}`,
    ];
    for (let i = 0; i < 50; i++) {
      const u = this._pick(patterns)();
      if (!this.usedUsernames.has(u)) { this.usedUsernames.add(u); return u; }
    }
    const fb = `user${Date.now()}${this._rand(1, 9999)}`;
    this.usedUsernames.add(fb);
    return fb;
  }

  _generateEmail(firstName, lastName, domains) {
    const fl = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ll = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domain = this._pick(domains);
    for (let i = 0; i < 50; i++) {
      const sep = this._pick(['', '.', '_']);
      const email = `${fl}${sep}${ll}${this._rand(1, 9999)}@${domain}`;
      if (!this.usedEmails.has(email)) { this.usedEmails.add(email); return email; }
    }
    const uid = crypto.randomBytes(4).toString('hex');
    const email = `${fl}${uid}@${this._pick(domains)}`;
    this.usedEmails.add(email);
    return email;
  }

  _generatePhone(prefix, len) {
    let d = String(this._rand(1, 9));
    for (let i = 1; i < len; i++) d += String(this._rand(0, 9));
    return `+${prefix}${d}`;
  }

  _generateDOB() {
    return new Date(this._rand(1975, 2004), this._rand(0, 11), this._rand(1, 28));
  }

  _generateCreatedAt(daysBack = 365) {
    return new Date(Date.now() - this._rand(1, daysBack) * 86400000);
  }

  _generateAvatar(name) {
    const style = this._pick(['avataaars', 'personas', 'notionists', 'lorelei', 'micah', 'adventurer', 'big-ears']);
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(name + this._rand(1, 99999))}`;
  }

  _fillTemplate(tmpl, vars) {
    return tmpl.replace(/{(\w+)}/g, (_, k) => vars[k] || '');
  }

  generateUser(options = {}) {
    // 1. Pick country (weighted by internet share)
    const originCountry = options.country || this._pick(this.weightedCountries);
    const cData = COUNTRIES[originCountry];
    if (!cData) throw new Error(`Unknown country: ${originCountry}`);

    // 2. Pick ethnic group (weighted within country)
    const ethGroups = cData.ethnicGroups;
    const ethWeighted = [];
    ethGroups.forEach(eg => { for (let i = 0; i < (eg.weight || 1); i++) ethWeighted.push(eg); });
    const ethnic = this._pick(ethWeighted);

    // 3. Pick name from ethnic group
    const firstName = this._pick(ethnic.firstNames);
    const lastName = this._pick(ethnic.lastNames);
    const fullName = `${firstName} ${lastName}`;

    // 4. Determine location — ethnic region OR diaspora
    let country = originCountry;
    let state, city, isDiaspora = false;

    const diaspora = DIASPORA_MAP[originCountry];
    if (diaspora && Math.random() < 0.08) { // 8% diaspora chance
      const dRoll = Math.random();
      let cumProb = 0;
      for (const d of diaspora) {
        cumProb += d.prob;
        if (dRoll < cumProb) {
          country = d.dest;
          city = this._pick(d.cities);
          // Find state from destination country
          const destData = COUNTRIES[country];
          if (destData) {
            for (const eg of destData.ethnicGroups) {
              for (const r of eg.regions) {
                if (r.cities.includes(city)) { state = r.state; break; }
              }
              if (state) break;
            }
            if (!state) state = destData.ethnicGroups[0]?.regions[0]?.state || '';
          }
          isDiaspora = true;
          break;
        }
      }
    }

    // If not diaspora, pick from ethnic group's regions
    if (!isDiaspora) {
      const region = this._pick(ethnic.regions);
      state = region.state;
      city = this._pick(region.cities);
    }

    const gender = this._pick(GENDERS);
    const occupation = this._pick(cData.occupations);
    const company = Math.random() > 0.35 ? this._pick(cData.companies) : '';
    const school = this._pick(cData.schools);
    const interests = this._pickN(cData.interests, this._rand(3, 7));
    const hometown = isDiaspora ? this._pick(ethnic.regions[0]?.cities || [city]) : city;
    const hometownCountry = isDiaspora ? originCountry : country;
    const createdAt = options.createdAt || this._generateCreatedAt(options.daysBack || 365);

    const vars = {
      city, country, occupation, company, school,
      interest1: interests[0] || 'Music', interest2: interests[1] || 'Travel', interest3: interests[2] || 'Food',
      hometown,
    };

    return {
      name: fullName,
      email: this._generateEmail(firstName, lastName, cData.emailDomains),
      username: this._generateUsername(firstName, lastName),
      password: '$2a$10$dummyHashedPasswordForSyntheticUsersOnly000000000000',
      bio: this._fillTemplate(this._pick(BIO_TEMPLATES), vars),
      avatar: this._generateAvatar(fullName),
      coverImage: `https://api.dicebear.com/7.x/shapes/svg?seed=${this._rand(1, 99999)}`,
      location: `${city}, ${country}`,
      locationData: {
        providedCountry: country,
        providedCity: city,
        providedLocation: `${city}, ${state}, ${country}`,
        detectedCountry: country,
        detectedCity: city,
        detectedRegion: state,
        locationType: 'verified',
        locationMatches: true,
      },
      personalInfo: {
        firstName, lastName,
        dateOfBirth: this._generateDOB(),
        gender,
        phone: this._generatePhone(cData.phonePrefix, cData.phoneLen),
        currentCity: city,
        currentCountry: country,
        hometown,
        hometownCountry,
        occupation,
        company,
        jobTitle: occupation,
        education: school,
        school,
        graduationYear: this._rand(2000, 2024),
        relationshipStatus: this._pick(RELATIONSHIP_STATUSES),
        interests,
        skills: this._pickN(SKILLS_POOL, this._rand(2, 5)),
        languages: this._pickN(LANGUAGES_POOL, this._rand(1, 3)),
        aboutMe: this._fillTemplate(this._pick(ABOUT_TEMPLATES), vars),
        religion: Math.random() > 0.3 ? 'Christianity' : '',
        favoriteQuote: '',
        visibility: {
          dateOfBirth: 'friends', phone: 'only_me', email: 'friends',
          location: 'public', relationshipStatus: 'friends', workplace: 'public',
        }
      },
      followerCount: this._rand(5, 500),
      followingCount: this._rand(10, 300),
      followersCount: 0,
      hasCompletedOnboarding: true,
      onboardingData: {
        fullName, role: this._pick(['creator','viewer','ministry','business']),
        goals: this._pickN(['grow_audience','create_content','connect','monetize','ministry'], 2),
        experience: this._pick(['beginner','intermediate','experienced']),
        completedAt: createdAt,
      },
      preferences: {
        emailNotifications: Math.random() > 0.3,
        pushNotifications: Math.random() > 0.2,
        newsletterSubscription: Math.random() > 0.5,
        theme: this._pick(['light','dark','system']),
        language: 'en',
      },
      isVerified: Math.random() > 0.7,
      isAdmin: false,
      role: Math.random() > 0.7 ? 'creator' : 'user',
      status: 'active',
      isEmailVerified: true,
      linkedProviders: ['email'],
      isSynthetic: true,
      syntheticMeta: {
        generatedAt: new Date(),
        batchId: options.batchId || null,
        sourceCountry: originCountry,
        ethnicGroup: ethnic.name,
        isDiaspora,
        livingIn: country,
        version: '2.0',
      },
      createdAt,
      updatedAt: createdAt,
      lastLogin: new Date(createdAt.getTime() + this._rand(1, 30) * 86400000),
    };
  }

  generateBatch(count, options = {}) {
    const batchId = options.batchId || `batch_${Date.now()}`;
    return Array.from({ length: count }, () =>
      this.generateUser({ ...options, batchId })
    );
  }
}

module.exports = { FakeUserGenerator, COUNTRIES };
