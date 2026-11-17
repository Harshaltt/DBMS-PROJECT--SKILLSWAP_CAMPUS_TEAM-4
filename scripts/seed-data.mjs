// Demo data for SkillSwap Campus. Every account uses the password below.
export const DEMO_PASSWORD = 'Password@123';

export const categories = [
  'Programming', 'Data Science', 'Design & Media', 'Music', 'Languages',
  'Mathematics', 'Electronics', 'Career & Soft Skills', 'Sports & Games',
  'Books & Notes', 'Lab & Equipment',
];

// [skill_name, category]
export const skills = [
  ['Python', 'Programming'], ['Java', 'Programming'], ['C++ & DSA', 'Programming'],
  ['Web Development', 'Programming'], ['Android Development', 'Programming'],
  ['Machine Learning', 'Data Science'], ['Statistics', 'Data Science'],
  ['SQL & Databases', 'Data Science'], ['Data Visualisation', 'Data Science'],
  ['UI/UX Design', 'Design & Media'], ['Video Editing', 'Design & Media'],
  ['Photography', 'Design & Media'], ['Graphic Design', 'Design & Media'],
  ['Guitar', 'Music'], ['Keyboard', 'Music'], ['Carnatic Vocals', 'Music'], ['Tabla', 'Music'],
  ['French', 'Languages'], ['German', 'Languages'], ['Japanese', 'Languages'], ['Kannada', 'Languages'],
  ['Calculus', 'Mathematics'], ['Linear Algebra', 'Mathematics'], ['Discrete Mathematics', 'Mathematics'],
  ['Arduino & IoT', 'Electronics'], ['PCB Design', 'Electronics'], ['MATLAB', 'Electronics'],
  ['Public Speaking', 'Career & Soft Skills'], ['Interview Preparation', 'Career & Soft Skills'],
  ['Badminton', 'Sports & Games'], ['Chess', 'Sports & Games'], ['Yoga', 'Sports & Games'],
];

// key, full_name, email, role, department, bio
export const users = [
  ['meera', 'Dr. Meera Krishnan', 'admin@campus.edu', 'admin', 'Computer Science', 'Platform administrator and faculty coordinator.'],
  ['ramesh', 'Prof. Ramesh Iyer', 'ramesh.iyer@campus.edu', 'staff', 'Electronics & Communication', 'Faculty mentor for the peer-learning programme.'],
  ['kavya', 'Kavya Rao', 'kavya.rao@campus.edu', 'staff', 'Student Affairs', 'Student affairs office - moderates listings.'],
  ['harsh', 'Harsh Mannan', 'harsh@campus.edu', 'student', 'Computer Science', 'CSE undergrad. I like building web apps and teaching Python.'],
  ['chirag', 'Chirag Arun Yadwad', 'chirag@campus.edu', 'student', 'Computer Science', 'CSE undergrad interested in ML and databases.'],
  ['ananya', 'Ananya Sharma', 'ananya@campus.edu', 'student', 'Computer Science', 'Anime fan who learnt Japanese the long way.'],
  ['rohan', 'Rohan Kulkarni', 'rohan@campus.edu', 'student', 'Electronics & Communication', 'Guitarist in the college band.'],
  ['priya', 'Priya Nair', 'priya@campus.edu', 'student', 'Biotechnology', 'Final-year biotech, drowning in lab data.'],
  ['aditya', 'Aditya Verma', 'aditya@campus.edu', 'student', 'Mechanical', 'Robotics club lead.'],
  ['sneha', 'Sneha Reddy', 'sneha@campus.edu', 'student', 'Design', 'Product designer, Figma addict.'],
  ['vikram', 'Vikram Hegde', 'vikram@campus.edu', 'student', 'Electrical & Electronics', 'Chess club captain.'],
  ['ishita', 'Ishita Joshi', 'ishita@campus.edu', 'student', 'Computer Science (AI & ML)', 'Kaggle notebooks and coffee.'],
  ['karthik', 'Karthik Subramanian', 'karthik@campus.edu', 'student', 'Management', 'Debate society president.'],
  ['neha', 'Neha Gupta', 'neha@campus.edu', 'student', 'Computer Science', 'Competitive programmer.'],
  ['arjun', 'Arjun Menon', 'arjun@campus.edu', 'student', 'Electronics & Communication', 'Makes PCBs for fun.'],
  ['diya', 'Diya Patel', 'diya@campus.edu', 'student', 'Biotechnology', 'Trained Carnatic vocalist.'],
  ['farhan', 'Farhan Sheikh', 'farhan@campus.edu', 'student', 'Mechanical', 'Shoots and edits the fest aftermovies.'],
  ['tanvi', 'Tanvi Desai', 'tanvi@campus.edu', 'student', 'Design', 'Illustrator, learning German for a master\'s.'],
];

// [user key, skill, level, offering?, description]
export const userSkills = [
  // Harsh
  ['harsh', 'Python', 'advanced', true, 'Python from basics to data analysis: pandas, NumPy, matplotlib, writing clean scripts and automating boring lab work.'],
  ['harsh', 'Web Development', 'advanced', true, 'Building websites and web apps with HTML, CSS, JavaScript, React and Next.js. Responsive layouts, APIs and deployment.'],
  ['harsh', 'Guitar', 'beginner', false, 'Want to learn basic chords and strumming so I can play songs with friends.'],
  ['harsh', 'Japanese', 'beginner', false, 'Hoping to learn hiragana and simple conversation before a trip to Tokyo.'],
  // Chirag
  ['chirag', 'Machine Learning', 'advanced', true, 'Supervised learning, model evaluation, scikit-learn and intro to neural networks with PyTorch. Help with ML course projects.'],
  ['chirag', 'SQL & Databases', 'expert', true, 'Database design, ER diagrams, normalisation, complex SQL joins, indexing, triggers and PostgreSQL performance tuning.'],
  ['chirag', 'Public Speaking', 'beginner', false, 'I freeze during presentations and viva exams. Want to speak confidently in front of a panel.'],
  ['chirag', 'Keyboard', 'beginner', false, 'Would love to learn to play simple melodies on the keyboard.'],
  // Ananya
  ['ananya', 'Japanese', 'advanced', true, 'JLPT N3 level. Hiragana, katakana, basic kanji and everyday conversation practice for beginners.'],
  ['ananya', 'C++ & DSA', 'intermediate', true, 'Arrays, linked lists, trees, graphs and dynamic programming in C++ for coding interviews.'],
  ['ananya', 'Web Development', 'beginner', false, 'Want to learn how to make my own portfolio website from scratch.'],
  // Rohan
  ['rohan', 'Guitar', 'expert', true, 'Acoustic and electric guitar: chords, strumming patterns, fingerpicking and playing your first songs in a week.'],
  ['rohan', 'Arduino & IoT', 'intermediate', true, 'Arduino projects with sensors, motors and WiFi modules - great for mini projects and hackathons.'],
  ['rohan', 'Python', 'beginner', false, 'Need to learn Python to automate data logging from my sensors.'],
  // Priya
  ['priya', 'Statistics', 'beginner', false, 'Need help analysing my lab experiment data and running regression for my final-year thesis.'],
  ['priya', 'French', 'intermediate', true, 'DELF B1 certified. Conversational French, grammar and pronunciation for absolute beginners.'],
  ['priya', 'Yoga', 'advanced', true, 'Morning hatha yoga and breathing routines to manage exam stress.'],
  // Aditya
  ['aditya', 'MATLAB', 'advanced', true, 'MATLAB and Simulink for control systems, signal plots and numerical methods assignments.'],
  ['aditya', 'Calculus', 'advanced', true, 'Limits, derivatives, integrals, multivariable calculus and differential equations for first-year engineering maths.'],
  ['aditya', 'Machine Learning', 'beginner', false, 'Want to use computer vision to make my robot recognise objects.'],
  // Sneha
  ['sneha', 'UI/UX Design', 'expert', true, 'Figma, wireframes, user research and turning an app idea into a clickable prototype that looks professional.'],
  ['sneha', 'Graphic Design', 'advanced', true, 'Posters, logos and social media creatives with Illustrator and Canva. Typography and colour basics.'],
  ['sneha', 'Web Development', 'beginner', false, 'Want to learn to code the frontends I design.'],
  // Vikram
  ['vikram', 'Chess', 'expert', true, 'Openings, middle-game strategy and endgame technique. Rated 1900 on Lichess.'],
  ['vikram', 'Linear Algebra', 'advanced', true, 'Matrices, eigenvalues, vector spaces and their use in machine learning and signal processing.'],
  ['vikram', 'German', 'beginner', false, 'Planning a master\'s in Germany, need basic German.'],
  // Ishita
  ['ishita', 'Statistics', 'expert', true, 'Probability, hypothesis testing, linear and logistic regression, ANOVA and interpreting p-values for research projects.'],
  ['ishita', 'Data Visualisation', 'advanced', true, 'Telling stories with data: matplotlib, seaborn, Tableau and dashboards that people actually read.'],
  ['ishita', 'Python', 'intermediate', true, 'Python for data science notebooks - Jupyter, pandas and cleaning messy CSV files.'],
  ['ishita', 'Carnatic Vocals', 'beginner', false, 'Always wanted to learn classical Indian singing.'],
  // Karthik
  ['karthik', 'Public Speaking', 'expert', true, 'Debate, stage presence and structuring a talk. Practice sessions for presentations, viva and group discussions.'],
  ['karthik', 'Interview Preparation', 'advanced', true, 'Mock HR and case interviews, resume reviews and how to answer tell-me-about-yourself.'],
  ['karthik', 'SQL & Databases', 'beginner', false, 'Need SQL for business analytics roles - joins and reporting queries.'],
  // Neha
  ['neha', 'C++ & DSA', 'expert', true, 'Competitive programming: Codeforces-style problem solving, graphs, segment trees and DP. Interview prep for product companies.'],
  ['neha', 'Java', 'advanced', true, 'Core Java, OOP concepts, collections and Spring Boot basics for placement preparation.'],
  ['neha', 'Photography', 'beginner', false, 'Want to learn to take better photos with my phone and a DSLR.'],
  // Arjun
  ['arjun', 'PCB Design', 'expert', true, 'Schematic capture and PCB layout in KiCad, soldering and getting boards manufactured.'],
  ['arjun', 'Arduino & IoT', 'advanced', true, 'Embedded C, sensors and ESP32 IoT dashboards for electronics projects.'],
  ['arjun', 'Badminton', 'beginner', false, 'Want to improve my badminton footwork and smash.'],
  // Diya
  ['diya', 'Carnatic Vocals', 'expert', true, 'Classical Indian vocal music: sruti, swaras, basic varnams and breathing technique.'],
  ['diya', 'Kannada', 'advanced', true, 'Spoken Kannada for everyday life in Bengaluru - autos, shops and making local friends.'],
  ['diya', 'Statistics', 'beginner', false, 'Biostatistics for analysing my experiment results.'],
  // Farhan
  ['farhan', 'Video Editing', 'expert', true, 'Premiere Pro and DaVinci Resolve: cutting, colour grading and making reels and event aftermovies.'],
  ['farhan', 'Photography', 'advanced', true, 'DSLR and mobile photography - composition, lighting and editing in Lightroom.'],
  ['farhan', 'Badminton', 'advanced', true, 'Badminton coaching: grip, footwork, smashes and doubles strategy.'],
  ['farhan', 'Guitar', 'beginner', false, 'Want to learn guitar for campfire songs.'],
  // Tanvi
  ['tanvi', 'German', 'advanced', true, 'Goethe B2. German grammar, vocabulary and speaking practice for students planning to study abroad.'],
  ['tanvi', 'Keyboard', 'intermediate', true, 'Keyboard and piano basics: reading notes, chords and playing popular songs.'],
  ['tanvi', 'UI/UX Design', 'beginner', false, 'Want to understand user research and app design.'],
];

// [owner key, title, description, category, condition]
export const resources = [
  ['harsh', 'Casio fx-991ES Plus Calculator', 'Scientific calculator allowed in university exams. Fresh battery.', 'Lab & Equipment', 'good'],
  ['harsh', 'Introduction to Algorithms (CLRS), 3rd Ed.', 'The classic algorithms textbook, lightly highlighted. Useful for DSA and interviews.', 'Books & Notes', 'good'],
  ['chirag', 'Database System Concepts - Korth', 'DBMS textbook by Silberschatz, Korth and Sudarshan, 7th edition.', 'Books & Notes', 'fair'],
  ['chirag', 'Raspberry Pi 4 (4 GB) Kit', 'With case, charger and 32 GB SD card preloaded with Raspberry Pi OS.', 'Electronics', 'good'],
  ['rohan', 'Yamaha F310 Acoustic Guitar', 'Beginner-friendly acoustic guitar with a soft case and spare strings.', 'Music', 'good'],
  ['rohan', 'Arduino Uno Starter Kit', 'Arduino Uno, breadboard, jumper wires, LEDs, sensors and servo motor.', 'Electronics', 'good'],
  ['aditya', 'Engineering Drawing Drafter Set', 'Mini drafter, set squares, compass and protractor for ED lab.', 'Lab & Equipment', 'worn'],
  ['aditya', 'Lab Coat (Size M)', 'White cotton lab coat for chemistry and biotech labs.', 'Lab & Equipment', 'fair'],
  ['sneha', 'Wacom One Drawing Tablet', 'Pen tablet for digital illustration and UI sketching.', 'Design & Media', 'new'],
  ['farhan', 'Canon EOS 1500D DSLR', 'Entry-level DSLR with 18-55 mm kit lens, two batteries and a 64 GB card.', 'Design & Media', 'good'],
  ['farhan', 'Yonex Badminton Racket', 'Lightweight racket with full cover. Shuttles not included.', 'Sports & Games', 'good'],
  ['neha', 'GATE CSE Handwritten Notes', 'Complete handwritten notes for OS, CN, TOC and DBMS from GATE coaching.', 'Books & Notes', 'good'],
  ['arjun', 'Digital Multimeter', 'Auto-ranging multimeter for circuits lab and debugging PCBs.', 'Electronics', 'new'],
  ['ishita', 'Hands-On Machine Learning (Geron)', 'Scikit-Learn, Keras and TensorFlow book, 2nd edition.', 'Books & Notes', 'good'],
  ['tanvi', 'Casio CT-S300 Keyboard', '61-key portable keyboard with stand and adapter.', 'Music', 'good'],
  ['vikram', 'Tournament Chess Set with Clock', 'Full-size wooden chess set plus digital chess clock.', 'Sports & Games', 'good'],
];

export const reviewComments = {
  5: ['Explained everything really clearly, highly recommend!', 'Super patient and well prepared.', 'Best session I have had on SkillSwap.', 'Went way beyond what I asked. Thank you!'],
  4: ['Very helpful, a bit rushed at the end.', 'Good session, learnt a lot.', 'Knows the topic well, would book again.'],
  3: ['Okay session, could have been more structured.', 'Helpful but started late.'],
  2: ['Not very prepared this time.'],
};
