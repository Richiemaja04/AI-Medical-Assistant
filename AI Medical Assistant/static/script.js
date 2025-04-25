// Global variables
let socket;
let userId = null;
let speechRecognition = null;
let currentActiveTimers = [];

// Chat Intelligence: Processes chat requests locally first, then fallback to Gemini API
class ChatIntelligence {
    constructor() {
        this.medications = [];
        this.appointments = [];
        this.timers = [];
        this.userProfile = null;
        this.healthInsights = [];
        this.commandPatterns = {
            // Medication related commands
            addMedication: [
                /add (a )?(new )?medication/i,
                /create (a )?(new )?medication/i,
                /new medication/i
            ],
            listMedications: [
                /list (my |all )?medications/i,
                /show (my |all )?medications/i,
                /what (are my|are the) medications/i,
                /my medications/i
            ],
            medicationStatus: [
                /medication status/i,
                /have I taken my (\w+)/i,
                /did I take (\w+)/i
            ],
            
            // Appointment related commands
            addAppointment: [
                /add (a )?(new )?appointment/i,
                /schedule (a )?(new )?appointment/i,
                /create (a )?(new )?appointment/i,
                /book (a )?(new )?appointment/i
            ],
            listAppointments: [
                /list (my |all )?appointments/i,
                /show (my |all )?appointments/i,
                /what (are my|are the) appointments/i,
                /my appointments/i,
                /upcoming appointments/i
            ],
            
            // Timer related commands
            addTimer: [
                /add (a )?(new )?timer/i,
                /create (a )?(new )?timer/i,
                /set (a )?(new )?timer/i,
                /start (a )?(new )?timer/i
            ],
            listTimers: [
                /list (my |all )?timers/i,
                /show (my |all )?timers/i,
                /what (are my|are the) timers/i,
                /my timers/i,
                /active timers/i
            ]
        };
        
        // Question patterns for local data
        this.questionPatterns = {
            medications: [
                /what medications (am I|do I) (taking|have)/i,
                /when (do I|should I) take (\w+)/i,
                /what dosage (of|for) (\w+)/i,
                /how (many|much) (\w+) (do I|should I) take/i,
                /tell me about my (\w+) medication/i
            ],
            appointments: [
                /when is my (next|upcoming) appointment/i,
                /do I have (an|any) appointment/i,
                /what appointments do I have/i,
                /when (am I|do I) see (doctor|dr) (\w+)/i,
                /appointment with (doctor|dr) (\w+)/i
            ],
            profile: [
                /what is my (height|weight|blood type)/i,
                /what are my (allergies|medical conditions)/i,
                /who is my emergency contact/i,
                /my (profile|medical profile|health profile)/i
            ],
            insights: [
                /health insights/i,
                /my health (status|condition)/i,
                /recent insights/i,
                /any health (tips|advice)/i
            ]
        };
    }
    
    async initialize() {
        await this.refreshLocalData();
    }
    
    // Refresh all local data
    async refreshLocalData() {
        try {
            // Load medications
            const medicationsResponse = await fetch('/medications', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            this.medications = await medicationsResponse.json();
            
            // Load appointments
            const appointmentsResponse = await fetch('/appointments', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            this.appointments = await appointmentsResponse.json();
            
            // Load timers
            const timersResponse = await fetch('/timers', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            this.timers = await timersResponse.json();
            
            // Load user profile
            const profileResponse = await fetch('/profile', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            this.userProfile = await profileResponse.json();
            
            // Load health insights
            const insightsResponse = await fetch('/insights', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            this.healthInsights = await insightsResponse.json();
            
            console.log('Local data refreshed successfully');
        } catch (error) {
            console.error('Error refreshing local data:', error);
        }
    }
    
    // Process a chat message
    async processMessage(message) {
        try {
            // First check if this is a command to execute an action
            const commandResponse = this.processCommand(message);
            if (commandResponse) {
                return commandResponse;
            }
            
            // Then check if this is a question that can be answered with local data
            const localAnswer = this.searchLocalData(message);
            if (localAnswer) {
                return localAnswer;
            }
            
            // If no local data matches, use Gemini API
            return await this.queryGeminiAPI(message);
        } catch (error) {
            console.error('Error processing message:', error);
            return 'Sorry, I encountered an error processing your request. Please try again.';
        }
    }
    
    // Process commands (add medication, list appointments, etc.)
    processCommand(message) {
        const normalizedMessage = message.toLowerCase();
        
        // Check for medication commands
        if (this.matchesPattern(normalizedMessage, this.commandPatterns.addMedication)) {
            document.getElementById('add-medication-modal').classList.add('active');
            return "I've opened the medication form for you. Please fill in the details.";
        }
        
        if (this.matchesPattern(normalizedMessage, this.commandPatterns.listMedications)) {
            return this.generateMedicationsList();
        }
        
        // Check for appointment commands
        if (this.matchesPattern(normalizedMessage, this.commandPatterns.addAppointment)) {
            document.getElementById('add-appointment-modal').classList.add('active');
            return "I've opened the appointment form for you. Please fill in the details.";
        }
        
        if (this.matchesPattern(normalizedMessage, this.commandPatterns.listAppointments)) {
            return this.generateAppointmentsList();
        }
        
        // Check for timer commands
        if (this.matchesPattern(normalizedMessage, this.commandPatterns.addTimer)) {
            document.getElementById('add-timer-modal').classList.add('active');
            return "I've opened the timer form for you. Please specify the duration.";
        }
        
        if (this.matchesPattern(normalizedMessage, this.commandPatterns.listTimers)) {
            return this.generateTimersList();
        }
        
        // Process natural language medication commands
        if (this.isMedicationCommand(normalizedMessage)) {
            return this.processNaturalLanguageMedicationCommand(normalizedMessage);
        }
        
        // Process natural language appointment commands
        if (this.isAppointmentCommand(normalizedMessage)) {
            return this.processNaturalLanguageAppointmentCommand(normalizedMessage);
        }
        
        // Process natural language timer commands
        if (this.isTimerCommand(normalizedMessage)) {
            return this.processNaturalLanguageTimerCommand(normalizedMessage);
        }
        
        return null; // No command matched
    }
    
    // Search local data for answers to questions
    searchLocalData(message) {
        const normalizedMessage = message.toLowerCase();
        
        // Check medication-related questions
        if (this.matchesAnyPattern(normalizedMessage, this.questionPatterns.medications)) {
            return this.answerMedicationQuestion(normalizedMessage);
        }
        
        // Check appointment-related questions
        if (this.matchesAnyPattern(normalizedMessage, this.questionPatterns.appointments)) {
            return this.answerAppointmentQuestion(normalizedMessage);
        }
        
        // Check profile-related questions
        if (this.matchesAnyPattern(normalizedMessage, this.questionPatterns.profile)) {
            return this.answerProfileQuestion(normalizedMessage);
        }
        
        // Check health insights-related questions
        if (this.matchesAnyPattern(normalizedMessage, this.questionPatterns.insights)) {
            return this.answerInsightQuestion(normalizedMessage);
        }
        
        return null; // No local data matched
    }
    
    // Query Gemini API for responses
    async queryGeminiAPI(message) {
        try {
            const response = await fetch('/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });
            
            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Error querying Gemini API:', error);
            return 'Sorry, I encountered an error while trying to get an answer. Please try again.';
        }
    }
    
    // Helper: Check if message matches any pattern in the array
    matchesAnyPattern(message, patterns) {
        return patterns.some(pattern => this.matchesPattern(message, pattern));
    }
    
    // Helper: Check if message matches a specific pattern
    matchesPattern(message, pattern) {
        if (Array.isArray(pattern)) {
            return pattern.some(p => p.test(message));
        }
        return pattern.test(message);
    }
    
    // Generate medications list response
    generateMedicationsList() {
        if (this.medications.length === 0) {
            return "You don't have any medications added yet. Would you like to add one now?";
        }
        
        let response = "Here are your medications:\n\n";
        
        this.medications.forEach(med => {
            response += `• ${med.name} (${med.dosage}) - ${med.frequency}, ${med.time_of_day}\n`;
            response += `  Status: ${med.status}\n`;
        });
        
        return response;
    }
    
    // Generate appointments list response
    generateAppointmentsList() {
        if (this.appointments.length === 0) {
            return "You don't have any appointments scheduled. Would you like to schedule one now?";
        }
        
        // Sort appointments by date
        const sortedAppointments = [...this.appointments].sort((a, b) => 
            new Date(a.date_time) - new Date(b.date_time)
        );
        
        let response = "Here are your upcoming appointments:\n\n";
        
        sortedAppointments.forEach(appt => {
            if (appt.status === 'Scheduled') {
                const apptDate = new Date(appt.date_time);
                const dateString = apptDate.toLocaleDateString();
                const timeString = apptDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                response += `• ${dateString} at ${timeString}\n`;
                response += `  Dr. ${appt.doctor_name}${appt.specialty ? ` (${appt.specialty})` : ''}\n`;
                response += `  Location: ${appt.location}\n`;
                if (appt.purpose) {
                    response += `  Purpose: ${appt.purpose}\n`;
                }
                response += '\n';
            }
        });
        
        return response;
    }
    
    // Generate timers list response
    generateTimersList() {
        if (this.timers.length === 0) {
            return "You don't have any timers set up. Would you like to create one now?";
        }
        
        let response = "Here are your timers:\n\n";
        
        this.timers.forEach(timer => {
            response += `• ${timer.name} - `;
            
            if (timer.status === 'Running') {
                const endTime = new Date(timer.end_time);
                const now = new Date();
                const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
                response += `Running (${this.formatTime(remainingSeconds)} remaining)\n`;
            } else {
                response += `${timer.status} (${this.formatTime(timer.duration)})\n`;
            }
        });
        
        return response;
    }
    
    // Format time (seconds) to HH:MM:SS
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
        ].join(':');
    }
    
    // Process natural language medication commands
    isMedicationCommand(message) {
        const addMedicationPatterns = [
            /remind me to take (\w+)/i,
            /add (\w+) (\d+\s*mg|\d+\s*ml) (once|twice|three times) (daily|a day)/i,
            /create medication (\w+)/i,
            /add (\w+) to my medications/i,
            /set reminder for (\w+)/i
        ];
        
        return this.matchesAnyPattern(message, addMedicationPatterns);
    }
    
    processNaturalLanguageMedicationCommand(message) {
        // Extract medication name
        let medicationName = '';
        let dosage = '';
        let frequency = '';
        let timeOfDay = '';
        
        const remindPattern = /remind me to take (\w+)/i;
        const detailedPattern = /add (\w+) (\d+\s*mg|\d+\s*ml) (once|twice|three times) (daily|a day)/i;
        const simpleAddPattern = /add (\w+) to my medications/i;
        const reminderPattern = /set reminder for (\w+)/i;
        
        if (remindPattern.test(message)) {
            medicationName = message.match(remindPattern)[1];
            
            // Look for timing information
            if (message.includes(' at ')) {
                timeOfDay = message.split(' at ')[1].trim();
            }
        } else if (detailedPattern.test(message)) {
            const matches = message.match(detailedPattern);
            medicationName = matches[1];
            dosage = matches[2];
            const timesPerDay = matches[3];
            
            if (timesPerDay.toLowerCase() === 'once') {
                frequency = 'Once daily';
            } else if (timesPerDay.toLowerCase() === 'twice') {
                frequency = 'Twice daily';
            } else if (timesPerDay.toLowerCase().includes('three')) {
                frequency = 'Three times daily';
            }
            
            // Look for timing information
            if (message.includes(' at ')) {
                timeOfDay = message.split(' at ')[1].trim();
            }
        } else if (simpleAddPattern.test(message)) {
            medicationName = message.match(simpleAddPattern)[1];
        } else if (reminderPattern.test(message)) {
            medicationName = message.match(reminderPattern)[1];
            
            // Look for timing information
            if (message.includes(' at ')) {
                timeOfDay = message.split(' at ')[1].trim();
            }
        }
        
        // Populate the medication form
        if (medicationName) {
            document.getElementById('medication-name').value = medicationName;
            
            if (dosage) {
                document.getElementById('medication-dosage').value = dosage;
            }
            
            if (frequency) {
                document.getElementById('medication-frequency').value = frequency;
            }
            
            if (timeOfDay) {
                document.getElementById('medication-time').value = timeOfDay;
            }
            
            // Open the add medication modal
            document.getElementById('add-medication-modal').classList.add('active');
            
            return `I've started creating a medication reminder for ${medicationName}. Please review and complete any missing information.`;
        }
        
        return null;
    }
    
    // Process natural language appointment commands
    isAppointmentCommand(message) {
        const appointmentPatterns = [
            /schedule (an )?(appointment|visit) with (dr|doctor)\.? (\w+)/i,
            /book (an )?(appointment|visit)/i,
            /make (an )?(appointment|visit)/i,
            /see (dr|doctor)\.? (\w+)/i
        ];
        
        return this.matchesAnyPattern(message, appointmentPatterns);
    }
    
    processNaturalLanguageAppointmentCommand(message) {
        // Extract appointment details
        let doctorName = '';
        let date = '';
        let time = '';
        let purpose = '';
        
        const drPattern = /(dr|doctor)\.?\s+(\w+)/i;
        const datePattern = /on\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d+)(?:st|nd|rd|th)?/i;
        const shortDatePattern = /on\s+(\d+)\/(\d+)(?:\/\d+)?/i;
        const relativeTimePattern = /(tomorrow|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday))/i;
        const timePattern = /at\s+(\d+(?::\d+)?\s*(?:am|pm))/i;
        const purposePattern = /for\s+(?:a|an)?\s+([a-zA-Z\s]+)(?:appointment|visit|checkup)?/i;
        
        if (drPattern.test(message)) {
            doctorName = message.match(drPattern)[2];
            
            // Try to extract date information
            if (datePattern.test(message)) {
                const dateMatch = message.match(datePattern);
                const month = dateMatch[1];
                const day = dateMatch[2];
                
                // Convert to a Date object
                const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(month.toLowerCase());
                
                if (monthIndex !== -1) {
                    const appointmentDate = new Date();
                    appointmentDate.setMonth(monthIndex);
                    appointmentDate.setDate(parseInt(day));
                    
                    date = appointmentDate.toISOString().split('T')[0];
                }
            } else if (shortDatePattern.test(message)) {
                const dateMatch = message.match(shortDatePattern);
                const month = parseInt(dateMatch[1]);
                const day = parseInt(dateMatch[2]);
                
                const appointmentDate = new Date();
                appointmentDate.setMonth(month - 1);
                appointmentDate.setDate(day);
                
                date = appointmentDate.toISOString().split('T')[0];
            } else if (relativeTimePattern.test(message)) {
                const timeMatch = message.match(relativeTimePattern);
                const relativeTime = timeMatch[1].toLowerCase();
                
                const appointmentDate = new Date();
                
                if (relativeTime === 'tomorrow') {
                    appointmentDate.setDate(appointmentDate.getDate() + 1);
                } else if (relativeTime.startsWith('next')) {
                    const dayOfWeek = relativeTime.split(' ')[1].toLowerCase();
                    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const targetDayIndex = daysOfWeek.indexOf(dayOfWeek);
                    
                    if (targetDayIndex !== -1) {
                        const currentDayIndex = appointmentDate.getDay();
                        const daysToAdd = (targetDayIndex + 7 - currentDayIndex) % 7;
                        appointmentDate.setDate(appointmentDate.getDate() + daysToAdd);
                    }
                }
                
                date = appointmentDate.toISOString().split('T')[0];
            }
            
            // Extract time information
            if (timePattern.test(message)) {
                const timeMatch = message.match(timePattern);
                time = timeMatch[1].trim();
                
                // Convert to 24-hour format
                if (time.toLowerCase().includes('am') || time.toLowerCase().includes('pm')) {
                    const timeParts = time.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
                    if (timeParts) {
                        let hours = parseInt(timeParts[1]);
                        const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
                        const period = timeParts[3].toLowerCase();
                        
                        if (period === 'pm' && hours < 12) {
                            hours += 12;
                        } else if (period === 'am' && hours === 12) {
                            hours = 0;
                        }
                        
                        time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                    }
                }
            }
            
            // Extract purpose information
            if (purposePattern.test(message)) {
                purpose = message.match(purposePattern)[1].trim();
            }
        }
        
        // Populate the appointment form
        if (doctorName) {
            document.getElementById('doctor-name').value = doctorName;
            
            if (date) {
                document.getElementById('appointment-date').value = date;
            }
            
            if (time) {
                document.getElementById('appointment-time').value = time;
            }
            
            if (purpose) {
                document.getElementById('appointment-purpose').value = purpose;
            }
            
            // Open the add appointment modal
            document.getElementById('add-appointment-modal').classList.add('active');
            
            return `I've started creating an appointment with Dr. ${doctorName}. Please review and complete any missing information.`;
        }
        
        return null;
    }
    
    // Process natural language timer commands
    isTimerCommand(message) {
        const timerPatterns = [
            /set (?:a )?timer for (\d+) (minute|minutes|hour|hours|second|seconds)/i,
            /start (?:a )?timer for (\d+) (minute|minutes|hour|hours|second|seconds)/i,
            /(\d+) (minute|minutes|hour|hours|second|seconds) timer/i
        ];
        
        return this.matchesAnyPattern(message, timerPatterns);
    }
    
    processNaturalLanguageTimerCommand(message) {
        // Extract timer details
        let duration = 0;
        let timerName = '';
        
        const timerPattern = /set (?:a )?timer for (\d+) (minute|minutes|hour|hours|second|seconds)/i;
        const startTimerPattern = /start (?:a )?timer for (\d+) (minute|minutes|hour|hours|second|seconds)/i;
        const shortTimerPattern = /(\d+) (minute|minutes|hour|hours|second|seconds) timer/i;
        const namePattern = /(?:called|named|for) (.+?)(?:$|for|\.|,)/i;
        
        let match = null;
        
        if (timerPattern.test(message)) {
            match = message.match(timerPattern);
        } else if (startTimerPattern.test(message)) {
            match = message.match(startTimerPattern);
        } else if (shortTimerPattern.test(message)) {
            match = message.match(shortTimerPattern);
        }
        
        if (match) {
            const amount = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            
            if (unit.startsWith('hour')) {
                duration = amount * 3600; // Convert hours to seconds
            } else if (unit.startsWith('minute')) {
                duration = amount * 60; // Convert minutes to seconds
            } else if (unit.startsWith('second')) {
                duration = amount;
            }
            
            // Extract timer name if present
            if (namePattern.test(message)) {
                timerName = message.match(namePattern)[1].trim();
            } else {
                // Default timer name based on duration
                if (unit.startsWith('hour')) {
                    timerName = `${amount} Hour Timer`;
                } else if (unit.startsWith('minute')) {
                    timerName = `${amount} Minute Timer`;
                } else {
                    timerName = `${amount} Second Timer`;
                }
            }
            
            // Set values in the timer form
            document.getElementById('timer-name').value = timerName;
            
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = duration % 60;
            
            document.getElementById('timer-hours').value = hours;
            document.getElementById('timer-minutes').value = minutes;
            document.getElementById('timer-seconds').value = seconds;
            
            // Automatically create the timer instead of showing the modal
            this.createTimer(timerName, duration);
            
            return `I've started a ${timerName} for ${this.formatTimeDuration(duration)}.`;
        }
        
        return null;
    }
    
    // Create a timer directly
    async createTimer(name, duration) {
        try {
            const response = await fetch('/timers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name,
                    duration
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                console.error('Error creating timer:', data.error);
                return false;
            }
            
            // Start the timer
            await fetch(`/timers/${data.timer_id}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // Refresh timers
            loadTimers();
            
            return true;
        } catch (error) {
            console.error('Error creating timer:', error);
            return false;
        }
    }
    
    // Format time duration in a readable format
    formatTimeDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let result = '';
        
        if (hours > 0) {
            result += `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        
        if (minutes > 0) {
            if (result) result += ' ';
            result += `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
        
        if (secs > 0 && hours === 0) { // Only show seconds if less than an hour
            if (result) result += ' ';
            result += `${secs} second${secs !== 1 ? 's' : ''}`;
        }
        
        return result;
    }
    
    // Answer medication-related questions
    answerMedicationQuestion(message) {
        if (this.medications.length === 0) {
            return "You don't have any medications added yet. Would you like to add one now?";
        }
        
        // Question about specific medication
        const medicationNamePattern = /(\w+) medication/i;
        const whenToTakePattern = /when (do I|should I) take (\w+)/i;
        const dosagePattern = /what dosage (of|for) (\w+)/i;
        const amountPattern = /how (many|much) (\w+) (do I|should I) take/i;
        
        // Extract medication name from various patterns
        let medicationName = null;
        
        if (medicationNamePattern.test(message)) {
            medicationName = message.match(medicationNamePattern)[1].toLowerCase();
        } else if (whenToTakePattern.test(message)) {
            medicationName = message.match(whenToTakePattern)[2].toLowerCase();
        } else if (dosagePattern.test(message)) {
            medicationName = message.match(dosagePattern)[2].toLowerCase();
        } else if (amountPattern.test(message)) {
            medicationName = message.match(amountPattern)[2].toLowerCase();
        }
        
        // If we found a medication name, look it up
        if (medicationName) {
            const medication = this.medications.find(med => 
                med.name.toLowerCase().includes(medicationName)
            );
            
            if (medication) {
                // Different responses based on question type
                if (whenToTakePattern.test(message)) {
                    return `You should take ${medication.name} ${medication.frequency.toLowerCase()} at ${medication.time_of_day}.`;
                } else if (dosagePattern.test(message) || amountPattern.test(message)) {
                    return `The dosage for ${medication.name} is ${medication.dosage}.`;
                } else {
                    // General information about the medication
                    return `${medication.name} (${medication.dosage}):\n` +
                          `- Take it ${medication.frequency.toLowerCase()} at ${medication.time_of_day}\n` +
                          `- Current status: ${medication.status}\n` +
                          `${medication.notes ? `- Notes: ${medication.notes}` : ''}`;
                }
            } else {
                return `I couldn't find any medication called "${medicationName}" in your records. Would you like to add it?`;
            }
        }
        
        // General question about all medications
        if (message.includes('what medications')) {
            return this.generateMedicationsList();
        }
        
        return null;
    }
    
    // Answer appointment-related questions
    answerAppointmentQuestion(message) {
        if (this.appointments.length === 0) {
            return "You don't have any appointments scheduled. Would you like to schedule one now?";
        }
        
        // Sort appointments by date
        const sortedAppointments = [...this.appointments].sort((a, b) => 
            new Date(a.date_time) - new Date(b.date_time)
        );
        
        // Filter to upcoming appointments
        const now = new Date();
        const upcomingAppointments = sortedAppointments.filter(appt => 
            new Date(appt.date_time) > now && appt.status === 'Scheduled'
        );
        
        // Question about next appointment
        if (message.includes('next appointment') || message.includes('upcoming appointment')) {
            if (upcomingAppointments.length === 0) {
                return "You don't have any upcoming appointments scheduled. Would you like to schedule one now?";
            }
            
            const nextAppt = upcomingAppointments[0];
            const apptDate = new Date(nextAppt.date_time);
            const dateString = apptDate.toLocaleDateString();
            const timeString = apptDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            return `Your next appointment is on ${dateString} at ${timeString} with Dr. ${nextAppt.doctor_name}` +
                  `${nextAppt.specialty ? ` (${nextAppt.specialty})` : ''} at ${nextAppt.location}` +
                  `${nextAppt.purpose ? ` for ${nextAppt.purpose}` : ''}.`;
        }
        
        // Question about appointments with specific doctor
        const doctorPattern = /(doctor|dr) (\w+)/i;
        if (doctorPattern.test(message)) {
            const doctorName = message.match(doctorPattern)[2].toLowerCase();
            
            const doctorAppointments = upcomingAppointments.filter(appt => 
                appt.doctor_name.toLowerCase().includes(doctorName)
            );
            
            if (doctorAppointments.length === 0) {
                return `You don't have any upcoming appointments with Dr. ${doctorName}. Would you like to schedule one?`;
            }
            
            const nextDrAppt = doctorAppointments[0];
            const apptDate = new Date(nextDrAppt.date_time);
            const dateString = apptDate.toLocaleDateString();
            const timeString = apptDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            return `Your next appointment with Dr. ${nextDrAppt.doctor_name} is on ${dateString} at ${timeString}` +
                  ` at ${nextDrAppt.location}${nextDrAppt.purpose ? ` for ${nextDrAppt.purpose}` : ''}.`;
        }
        
        // General question about all appointments
        return this.generateAppointmentsList();
    }
    
    // Answer profile-related questions
    answerProfileQuestion(message) {
        if (!this.userProfile) {
            return "I don't have your medical profile information yet. Please update your profile first.";
        }
        
        if (message.includes('height')) {
            return `Your height is ${this.userProfile.height} cm.`;
        }
        
        if (message.includes('weight')) {
            return `Your weight is ${this.userProfile.weight} kg.`;
        }
        
        if (message.includes('blood type')) {
            return `Your blood type is ${this.userProfile.blood_type}.`;
        }
        
        if (message.includes('allergies')) {
            if (!this.userProfile.allergies) {
                return "You don't have any allergies listed in your profile.";
            }
            return `Your allergies include: ${this.userProfile.allergies}`;
        }
        
        if (message.includes('medical conditions') || message.includes('health conditions')) {
            if (!this.userProfile.medical_conditions) {
                return "You don't have any medical conditions listed in your profile.";
            }
            return `Your medical conditions include: ${this.userProfile.medical_conditions}`;
        }
        
        if (message.includes('emergency contact')) {
            if (!this.userProfile.emergency_contact) {
                return "You don't have an emergency contact listed in your profile.";
            }
            return `Your emergency contact is: ${this.userProfile.emergency_contact}`;
        }
        
        // General profile question
        return `Here's your medical profile:\n\n` +
              `- Height: ${this.userProfile.height} cm\n` +
              `- Weight: ${this.userProfile.weight} kg\n` +
              `- Blood Type: ${this.userProfile.blood_type}\n` +
              `- Allergies: ${this.userProfile.allergies || 'None listed'}\n` +
              `- Medical Conditions: ${this.userProfile.medical_conditions || 'None listed'}\n` +
              `- Emergency Contact: ${this.userProfile.emergency_contact || 'None listed'}`;
    }
    
    // Answer health insights-related questions
    answerInsightQuestion(message) {
        if (this.healthInsights.length === 0) {
            return "I don't have any health insights for you yet. They will be generated based on your health data and activity patterns.";
        }
        
        // Sort insights by date (newest first)
        const sortedInsights = [...this.healthInsights].sort((a, b) => 
            new Date(b.generated_at) - new Date(a.generated_at)
        );
        
        let response = "Here are your recent health insights:\n\n";
        
        // Show the three most recent insights
        sortedInsights.slice(0, 3).forEach(insight => {
            const date = new Date(insight.generated_at);
            const dateString = date.toLocaleDateString();
            
            response += `• ${dateString}: ${insight.content}\n\n`;
        });
        
        return response;
    }
}

// Initialize chat intelligence
const chatIntelligence = new ChatIntelligence();

// Voice Assistant class
class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.lastResponse = '';
        this.voicePreference = 'en-US';
        this.commandKeywords = [
            { keyword: 'medication', handler: this.handleMedicationCommand },
            { keyword: 'appointment', handler: this.handleAppointmentCommand },
            { keyword: 'timer', handler: this.handleTimerCommand },
            { keyword: 'remind me', handler: this.handleReminderCommand }
        ];
    }
    
    setVoicePreference(language) {
        this.voicePreference = language;
    }
    
    startListening() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('Your browser does not support speech recognition. Please use Chrome or Edge.');
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.voicePreference;
        
        let finalTranscript = '';
        
        this.recognition.onstart = () => {
            this.isListening = true;
            document.getElementById('voice-indicator').classList.add('active');
        };
        
        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                    
                    // Check for command keywords
                    const lowerTranscript = finalTranscript.toLowerCase();
                    let isCommand = false;
                    
                    for (const command of this.commandKeywords) {
                        if (lowerTranscript.includes(command.keyword)) {
                            command.handler.call(this, finalTranscript);
                            isCommand = true;
                            break;
                        }
                    }
                    
                    if (!isCommand) {
                        // If not a specific command, treat as normal chat message
                        document.getElementById('chat-input-field').value = finalTranscript;
                    }
                } else {
                    interimTranscript += transcript;
                    document.getElementById('chat-input-field').value = finalTranscript + interimTranscript;
                }
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.stopListening();
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            document.getElementById('voice-indicator').classList.remove('active');
            
            if (document.getElementById('chat-input-field').value.trim()) {
                sendChatMessage();
            }
        };
        
        this.recognition.start();
    }
    
    stopListening() {
        if (this.recognition) {
            this.recognition.stop();
            this.isListening = false;
        }
    }
    
    speak(text) {
        if (!this.synthesis) {
            console.error('Speech synthesis not supported');
            return;
        }
        
        // Cancel any ongoing speech
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = this.voicePreference;
        
        // Select a voice that matches the language preference
        const voices = this.synthesis.getVoices();
        const preferredVoice = voices.find(voice => voice.lang.includes(this.voicePreference.split('-')[0]));
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        this.synthesis.speak(utterance);
        this.lastResponse = text;
    }
    
    // Command handlers
    handleMedicationCommand(transcript) {
        const lowerTranscript = transcript.toLowerCase();
        
        if (lowerTranscript.includes('add') || lowerTranscript.includes('new')) {
            // Extract medication details
            const nameMatch = transcript.match(/called\s+([a-zA-Z\s]+)/i) || 
                             transcript.match(/add\s+([a-zA-Z\s]+)(?:\s+medication|\s+pill|\s+tablet)/i);
            
            const dosageMatch = transcript.match(/(\d+\s*mg|\d+\s*ml|\d+\s*tablet|\d+\s*pill)/i);
            
            const frequencyMatch = transcript.match(/(\w+\s+times\s+daily|once\s+daily|twice\s+daily|every\s+\w+\s+hours)/i);
            
            const timeMatch = transcript.match(/(at\s+\d+(?::\d+)?\s*(?:am|pm)|in\s+the\s+morning|in\s+the\s+evening|at\s+night)/i);
            
            if (nameMatch) {
                document.getElementById('medication-name').value = nameMatch[1].trim();
                
                if (dosageMatch) {
                    document.getElementById('medication-dosage').value = dosageMatch[1].trim();
                }
                
                if (frequencyMatch) {
                    const frequency = frequencyMatch[1].trim();
                    const selectElement = document.getElementById('medication-frequency');
                    
                    // Find the best match in the select options
                    Array.from(selectElement.options).forEach(option => {
                        if (frequency.toLowerCase().includes(option.value.toLowerCase())) {
                            selectElement.value = option.value;
                        }
                    });
                }
                
                if (timeMatch) {
                    document.getElementById('medication-time').value = timeMatch[1].replace('at ', '').trim();
                }
                
                // Open the add medication modal
                document.getElementById('add-medication-modal').classList.add('active');
                
                this.speak("I've prepared a medication form with the details I heard. Please review and complete any missing information.");
            } else {
                document.getElementById('add-medication-modal').classList.add('active');
                this.speak("I've opened the medication form. Please fill in the details.");
            }
        } else if (lowerTranscript.includes('list') || lowerTranscript.includes('show')) {
            // Navigate to medications tab
            document.querySelector('.nav-item[data-section="medications"]').click();
            this.speak("Here are your medications.");
        }
    }
    
    handleAppointmentCommand(transcript) {
        const lowerTranscript = transcript.toLowerCase();
        
        if (lowerTranscript.includes('add') || lowerTranscript.includes('new') || lowerTranscript.includes('schedule')) {
            // Extract appointment details
            const doctorMatch = transcript.match(/with\s+(?:dr\.|doctor)\s+([a-zA-Z\s]+)/i);
            
            const dateMatch = transcript.match(/on\s+([a-zA-Z]+\s+\d+(?:st|nd|rd|th)?)/i) || 
                             transcript.match(/(tomorrow|next\s+\w+|\d+\/\d+(?:\/\d+)?)/i);
            
            const timeMatch = transcript.match(/at\s+(\d+(?::\d+)?\s*(?:am|pm))/i);
            
            const purposeMatch = transcript.match(/for\s+(?:a|an)?\s+([a-zA-Z\s]+)(?:appointment|visit|checkup)?/i);
            
            if (doctorMatch) {
                document.getElementById('doctor-name').value = doctorMatch[1].trim().replace(/^(dr\.?|doctor)\s+/i, '');
                
                if (dateMatch) {
                    // Convert to date format - this is simplified and would need more robust parsing
                    let dateStr = dateMatch[1].trim();
                    
                    if (dateStr.toLowerCase() === 'tomorrow') {
                        const tomorrow = new Date();
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        document.getElementById('appointment-date').value = tomorrow.toISOString().split('T')[0];
                    } else if (dateStr.toLowerCase().startsWith('next')) {
                        // Handle "next Monday", etc.
                        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                        const dayName = dateStr.toLowerCase().replace('next ', '');
                        const dayIndex = days.indexOf(dayName);
                        
                        if (dayIndex !== -1) {
                            const today = new Date();
                            const currentDay = today.getDay();
                            const daysUntilNextDay = (dayIndex + 7 - currentDay) % 7;
                            const nextDay = new Date();
                            nextDay.setDate(today.getDate() + (daysUntilNextDay || 7));
                            document.getElementById('appointment-date').value = nextDay.toISOString().split('T')[0];
                        }
                    } else if (dateStr.match(/\d+\/\d+/)) {
                        // Handle MM/DD format
                        const [month, day] = dateStr.split('/');
                        const year = new Date().getFullYear();
                        const date = new Date(year, parseInt(month) - 1, parseInt(day));
                        document.getElementById('appointment-date').value = date.toISOString().split('T')[0];
                    }
                }
                
                if (timeMatch) {
                    const timeStr = timeMatch[1].trim();
                    // Convert to 24-hour format for input
                    const timeParts = timeStr.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
                    if (timeParts) {
                        let hours = parseInt(timeParts[1]);
                        const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
                        const period = timeParts[3].toLowerCase();
                        
                        if (period === 'pm' && hours < 12) {
                            hours += 12;
                        } else if (period === 'am' && hours === 12) {
                            hours = 0;
                        }
                        
                        document.getElementById('appointment-time').value = 
                            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                    }
                }
                
                if (purposeMatch) {
                    document.getElementById('appointment-purpose').value = purposeMatch[1].trim();
                }
                
                document.getElementById('add-appointment-modal').classList.add('active');
                this.speak("I've prepared an appointment form with the details I heard. Please review and complete any missing information.");
            } else {
                document.getElementById('add-appointment-modal').classList.add('active');
                this.speak("I've opened the appointment form. Please fill in the details.");
            }
        } else if (lowerTranscript.includes('list') || lowerTranscript.includes('show')) {
            // Navigate to appointments tab
            document.querySelector('.nav-item[data-section="appointments"]').click();
            this.speak("Here are your appointments.");
        }
    }
    
    handleTimerCommand(transcript) {
        const lowerTranscript = transcript.toLowerCase();
        
        if (lowerTranscript.includes('start') || lowerTranscript.includes('set')) {
            // Extract timer details
            const nameMatch = transcript.match(/(?:for|called)\s+([a-zA-Z\s]+)(?:for|called)?/i);
            
            const durationMatch = transcript.match(/(\d+)\s+minutes?/i) ||
                               transcript.match(/(\d+)\s+hours?/i) ||
                               transcript.match(/(\d+)\s+seconds?/i);
            
            if (durationMatch) {
                const durationType = lowerTranscript.includes('minute') ? 'minutes' : 
                                   lowerTranscript.includes('hour') ? 'hours' : 'seconds';
                
                const duration = parseInt(durationMatch[1]);
                
                document.getElementById('timer-name').value = nameMatch ? nameMatch[1].trim() : 'Voice Timer';
                
                if (durationType === 'minutes') {
                    document.getElementById('timer-hours').value = 0;
                    document.getElementById('timer-minutes').value = duration;
                    document.getElementById('timer-seconds').value = 0;
                } else if (durationType === 'hours') {
                    document.getElementById('timer-hours').value = duration;
                    document.getElementById('timer-minutes').value = 0;
                    document.getElementById('timer-seconds').value = 0;
                } else {
                    document.getElementById('timer-hours').value = 0;
                    document.getElementById('timer-minutes').value = 0;
                    document.getElementById('timer-seconds').value = duration;
                }
                
                document.getElementById('add-timer-modal').classList.add('active');
                this.speak(`I've set up a timer for ${duration} ${durationType}. Please review and confirm.`);
            } else {
                document.getElementById('add-timer-modal').classList.add('active');
                this.speak("I've opened the timer form. Please specify the duration.");
            }
        } else if (lowerTranscript.includes('list') || lowerTranscript.includes('show')) {
            // Navigate to timers tab
            document.querySelector('.nav-item[data-section="timers"]').click();
            this.speak("Here are your timers.");
        }
    }
    
    handleReminderCommand(transcript) {
        const lowerTranscript = transcript.toLowerCase();
        
        // Check for medication reminder
        if (lowerTranscript.includes('take') && (lowerTranscript.includes('pill') || lowerTranscript.includes('medication'))) {
            this.handleMedicationCommand(transcript);
        } 
        // Check for appointment reminder
        else if (lowerTranscript.includes('doctor') || lowerTranscript.includes('appointment')) {
            this.handleAppointmentCommand(transcript);
        }
        // General reminder - could add to a "Notes" feature in the future
        else {
            addMessageToChat(transcript, 'user');
            
            fetch('/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: transcript })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    console.error('Chat error:', data.error);
                    const errorMsg = 'Sorry, I encountered an error. Please try again.';
                    addMessageToChat(errorMsg, 'assistant');
                    this.speak(errorMsg);
                } else {
                    // Add AI response to chat
                    addMessageToChat(data.response, 'assistant');
                    this.speak(data.response);
                }
            })
            .catch(error => {
                console.error('Chat request error:', error);
                const errorMsg = 'Sorry, I encountered an error. Please try again.';
                addMessageToChat(errorMsg, 'assistant');
                this.speak(errorMsg);
            });
        }
    }
}

// Initialize voice assistant
const voiceAssistant = new VoiceAssistant();

// Health Analytics Module
class HealthAnalytics {
    constructor() {
        this.medicationData = [];
        this.appointmentData = [];
        this.healthInsights = [];
        this.vitalsData = []; // For potential wearable integration
    }
    
    init() {
        this.loadMedicationData();
        this.loadAppointmentData();
        this.loadHealthInsights();
    }
    
    loadMedicationData() {
        fetch('/medications', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            this.medicationData = data;
            this.analyzeMedicationAdherence();
        })
        .catch(error => {
            console.error('Error loading medication data for analytics:', error);
        });
    }
    
    loadAppointmentData() {
        fetch('/appointments', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            this.appointmentData = data;
            this.analyzeAppointmentPatterns();
        })
        .catch(error => {
            console.error('Error loading appointment data for analytics:', error);
        });
    }
    
    loadHealthInsights() {
        fetch('/insights', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            this.healthInsights = data;
        })
        .catch(error => {
            console.error('Error loading health insights for analytics:', error);
        });
    }
    
    analyzeMedicationAdherence() {
        if (this.medicationData.length === 0) return;
        
        let totalReminders = 0;
        let takenOnTime = 0;
        let missed = 0;
        
        this.medicationData.forEach(med => {
            if (med.reminders && med.reminders.length > 0) {
                med.reminders.forEach(reminder => {
                    totalReminders++;
                    
                    if (reminder.status === 'Acknowledged') {
                        takenOnTime++;
                    } else if (reminder.status === 'Pending' && new Date(reminder.scheduled_time) < new Date()) {
                        missed++;
                    }
                });
            }
        });
        
        if (totalReminders > 0) {
            const adherenceRate = (takenOnTime / totalReminders) * 100;
            
            console.log(`Medication Adherence: ${adherenceRate.toFixed(1)}%`);
            
            // Could display this in a dashboard widget
            if (adherenceRate < 80 && missed > 0) {
                // Generate an insight
                this.generateAdherenceInsight(adherenceRate, missed);
            }
        }
    }
    
    analyzeAppointmentPatterns() {
        if (this.appointmentData.length === 0) return;
        
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const recentAppointments = this.appointmentData.filter(appt => {
            const apptDate = new Date(appt.date_time);
            return apptDate >= sixMonthsAgo && apptDate <= now;
        });
        
        const specialtyCounts = {};
        recentAppointments.forEach(appt => {
            const specialty = appt.specialty || 'General';
            specialtyCounts[specialty] = (specialtyCounts[specialty] || 0) + 1;
        });
        
        // Find most visited specialty
        let maxVisits = 0;
        let mostVisitedSpecialty = '';
        
        for (const specialty in specialtyCounts) {
            if (specialtyCounts[specialty] > maxVisits) {
                maxVisits = specialtyCounts[specialty];
                mostVisitedSpecialty = specialty;
            }
        }
        
        if (mostVisitedSpecialty) {
            console.log(`Most visited specialty: ${mostVisitedSpecialty} (${maxVisits} visits)`);
            // Could display this insight in the dashboard
        }
        
        // Check for missed appointments
        const missedAppointments = this.appointmentData.filter(appt => 
            appt.status === 'Cancelled' || (appt.status === 'Scheduled' && new Date(appt.date_time) < now)
        );
        
        if (missedAppointments.length > 0) {
            console.log(`Missed appointments: ${missedAppointments.length}`);
            // Generate insight if needed
        }
    }
    
    generateAdherenceInsight(adherenceRate, missedCount) {
        // This would typically call the server to generate an AI insight
        // For now, we'll just log it
        console.log(`Adherence insight: Your medication adherence rate is ${adherenceRate.toFixed(1)}%. You've missed ${missedCount} doses recently.`);
    }
    
    // Method that could be called to integrate with wearable data
    processVitalsData(vitalsData) {
        this.vitalsData = [...this.vitalsData, ...vitalsData];
        
        // Analyze trends, could trigger alerts for concerning patterns
        // This is a placeholder for future functionality
    }
}

// Enhanced offline support
class OfflineManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.pendingRequests = [];
        this.initialized = false;
        
        window.addEventListener('online', this.handleOnlineStatusChange.bind(this));
        window.addEventListener('offline', this.handleOnlineStatusChange.bind(this));
    }
    
    init() {
        if (this.initialized) return;
        
        // Check if local storage has pending requests
        const storedRequests = localStorage.getItem('pendingRequests');
        if (storedRequests) {
            try {
                this.pendingRequests = JSON.parse(storedRequests);
            } catch (e) {
                console.error('Error parsing stored requests:', e);
                localStorage.removeItem('pendingRequests');
            }
        }
        
        this.initialized = true;
        
        // Process any pending requests if we're online
        if (this.isOnline && this.pendingRequests.length > 0) {
            this.processPendingRequests();
        }
    }
    
    handleOnlineStatusChange() {
        const wasOnline = this.isOnline;
        this.isOnline = navigator.onLine;
        
        if (!wasOnline && this.isOnline) {
            // Just came back online
            console.log('Connection restored. Processing pending requests...');
            
            // Show toast notification
            this.showNotification('You are back online.');
            
            // Process any pending requests
            this.processPendingRequests();
        } else if (wasOnline && !this.isOnline) {
            // Just went offline
            console.log('Connection lost. Requests will be queued.');
            
            // Show toast notification
            this.showNotification('You are offline. Changes will be saved when your connection is restored.');
        }
    }
    
    queueRequest(requestInfo) {
        this.pendingRequests.push(requestInfo);
        
        // Store in local storage for persistence
        localStorage.setItem('pendingRequests', JSON.stringify(this.pendingRequests));
        
        console.log('Request queued for later processing');
    }
    
    processPendingRequests() {
        if (this.pendingRequests.length === 0) return;
        
        console.log(`Processing ${this.pendingRequests.length} pending requests...`);
        
        const requests = [...this.pendingRequests];
        this.pendingRequests = [];
        localStorage.removeItem('pendingRequests');
        
        requests.forEach(requestInfo => {
            fetch(requestInfo.url, {
                method: requestInfo.method,
                headers: requestInfo.headers,
                body: requestInfo.body
            })
            .then(response => response.json())
            .then(data => {
                console.log('Processed queued request:', data);
                
                // Call the success callback if provided
                if (requestInfo.onSuccess) {
                    requestInfo.onSuccess(data);
                }
            })
            .catch(error => {
                console.error('Error processing queued request:', error);
                
                // If still failing, re-queue
                if (error.name !== 'AbortError') {
                    this.queueRequest(requestInfo);
                }
            });
        });
    }
    
    showNotification(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
    
    // Enhanced fetch function that works offline
    fetch(url, options = {}, onSuccess = null) {
        if (!this.isOnline) {
            // If offline, queue the request
            const requestInfo = {
                url,
                method: options.method || 'GET',
                headers: options.headers || {},
                body: options.body || null,
                onSuccess
            };
            
            this.queueRequest(requestInfo);
            
            // Return a promise that resolves with a simulated response
            return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ queued: true, message: 'Request queued for processing when online' })
            });
        }
        
        // If online, proceed with the regular fetch
        return fetch(url, options);
    }
}

// Initialize health analytics
const healthAnalytics = new HealthAnalytics();

// Initialize offline manager
const offlineManager = new OfflineManager();

// Enhanced error handling
function handleAPIError(error, context = '') {
    console.error(`API Error (${context}):`, error);
    
    const errorMessage = error.response && error.response.data && error.response.data.message 
        ? error.response.data.message 
        : 'An unexpected error occurred. Please try again.';
    
    // Show user-friendly error message
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.innerHTML = `
        <div class="error-icon"><i class="fas fa-exclamation-circle"></i></div>
        <div class="error-message">${errorMessage}</div>
        <button class="error-close">&times;</button>
    `;
    
    document.body.appendChild(toast);
    
    // Add event listener to close button
    toast.querySelector('.error-close').addEventListener('click', () => {
        document.body.removeChild(toast);
    });
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (document.body.contains(toast)) {
            document.body.removeChild(toast);
        }
    }, 5000);
    
    // Log to server for monitoring (in a real app)
    // logErrorToServer(error, context);
    
    return errorMessage;
}

// Accessibility improvements
function initializeAccessibility() {
    // Add ARIA attributes
    document.querySelectorAll('button').forEach(button => {
        if (!button.getAttribute('aria-label') && !button.textContent.trim()) {
            // Add meaningful labels to icon-only buttons
            const icon = button.querySelector('i');
            if (icon) {
                const iconClass = Array.from(icon.classList).find(cls => cls.startsWith('fa-'));
                if (iconClass) {
                    const label = iconClass.replace('fa-', '').replace(/-/g, ' ');
                    button.setAttribute('aria-label', label);
                }
            }
        }
    });
    
    // Add keyboard navigation for modal dialogs
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                modal.classList.remove('active');
            }
        });
    });
    
    // Make notifications screen reader friendly
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.classList && node.classList.contains('notification-item')) {
                        node.setAttribute('role', 'alert');
                        node.setAttribute('aria-live', 'polite');
                    }
                });
            }
        });
    });
    
    observer.observe(document.getElementById('notification-list'), { childList: true });
    
    // Improve focus management
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-user');
        }
    });
    
    document.addEventListener('mousedown', () => {
        document.body.classList.remove('keyboard-user');
    });
    
    // Add styles for keyboard focus
    const style = document.createElement('style');
    style.textContent = `
        .keyboard-user :focus {
            outline: 2px solid var(--primary-color) !important;
            outline-offset: 2px !important;
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    const storedUserId = localStorage.getItem('userId');
    const storedUsername = localStorage.getItem('username');
    
    if (storedUserId && storedUsername) {
        userId = storedUserId;
        document.getElementById('greeting').textContent = `Hello, ${storedUsername}!`;
        
        // Check if user has completed profile
        fetch('/profile', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                localStorage.removeItem('userId');
                localStorage.removeItem('username');
                showScreen('auth-screen');
                throw new Error('Session expired');
            }
        })
        .then(data => {
            if (data.height && data.weight && data.blood_type) {
                // Profile is complete, show main screen
                showScreen('main-screen');
                initializeApp();
            } else {
                // Profile is incomplete, show profile setup
                showScreen('profile-setup-screen');
            }
        })
        .catch(error => {
            console.error('Error checking profile:', error);
            showScreen('auth-screen');
        });
    } else {
        showScreen('auth-screen');
    }
    
    // Bind event listeners
    bindAuthEvents();
    bindProfileSetupEvents();
    bindMainScreenEvents();
    bindMedicationEvents();
    bindAppointmentEvents();
    bindTimerEvents();
    bindNotificationEvents();
    bindChatEvents();
    
    // Initialize additional components
    initializeAccessibility();
    offlineManager.init();
    
    // Initialize health analytics after app is initialized
    document.addEventListener('appInitialized', () => {
        healthAnalytics.init();
    });
    
    // Add CSS for new features
    const style = document.createElement('style');
    style.textContent = `
        .toast-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 12px 20px;
            border-radius: 4px;
            max-width: 300px;
            box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
            transform: translateY(100px);
            opacity: 0;
            transition: transform 0.3s, opacity 0.3s;
            z-index: 1100;
        }
        
        .toast-notification.show {
            transform: translateY(0);
            opacity: 1;
        }
        
        .error-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            padding: 12px 16px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 12px;
            max-width: 400px;
            box-shadow: 0 3px 6px rgba(0, 0, 0, 0.2);
            z-index: 1100;
            animation: slideInRight 0.3s;
        }
        
        .error-icon {
            font-size: 20px;
        }
        
        .error-message {
            flex: 1;
        }
        
        .error-close {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #721c24;
        }
        
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
});

// Authentication related event listeners
function bindAuthEvents() {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tabId = btn.getAttribute('data-tab');
            document.querySelectorAll('.auth-form').forEach(form => {
                form.classList.remove('active');
            });
            document.getElementById(`${tabId}-form`).classList.add('active');
        });
    });
    
    // Login form
    document.getElementById('login-btn').addEventListener('click', () => {
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            document.getElementById('login-error').textContent = 'Please enter both username and password';
            return;
        }
        
        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('login-error').textContent = data.error;
            } else {
                // Login successful
                localStorage.setItem('userId', data.user_id);
                localStorage.setItem('username', data.username);
                userId = data.user_id;
                document.getElementById('greeting').textContent = `Hello, ${data.username}!`;
                
                if (data.has_medical_profile) {
                    showScreen('main-screen');
                    initializeApp();
                } else {
                    showScreen('profile-setup-screen');
                }
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            document.getElementById('login-error').textContent = 'An error occurred during login. Please try again.';
        });
    });
    
    // Register form
    document.getElementById('register-btn').addEventListener('click', () => {
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm').value;
        
        // Simple validation
        if (!username || !email || !password || !confirmPassword) {
            document.getElementById('register-error').textContent = 'Please fill in all fields';
            return;
        }
        
        if (password !== confirmPassword) {
            document.getElementById('register-error').textContent = 'Passwords do not match';
            return;
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            document.getElementById('register-error').textContent = 'Please enter a valid email address';
            return;
        }
        
        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('register-error').textContent = data.error;
            } else {
                // Registration successful
                document.getElementById('login-username').value = username;
                document.getElementById('login-password').value = password;
                
                // Switch to login tab
                document.querySelector('.tab-btn[data-tab="login"]').click();
                alert('Registration successful! Please log in.');
            }
        })
        .catch(error => {
            console.error('Registration error:', error);
            document.getElementById('register-error').textContent = 'An error occurred during registration. Please try again.';
        });
    });
}

// Profile setup event listeners
function bindProfileSetupEvents() {
    document.getElementById('medical-profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const height = document.getElementById('height').value;
        const weight = document.getElementById('weight').value;
        const bloodType = document.getElementById('blood-type').value;
        const allergies = document.getElementById('allergies').value;
        const medicalConditions = document.getElementById('medical-conditions').value;
        const emergencyContact = document.getElementById('emergency-contact').value;
        const language = document.getElementById('language').value;
        
        // Simple validation
        if (!height || !weight || !bloodType) {
            alert('Please fill in the required fields: Height, Weight, and Blood Type');
            return;
        }
        
        fetch('/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                height,
                weight,
                blood_type: bloodType,
                allergies,
                medical_conditions: medicalConditions,
                emergency_contact: emergencyContact,
                preferred_language: language
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                showScreen('main-screen');
                initializeApp();
            }
        })
        .catch(error => {
            console.error('Profile update error:', error);
            alert('An error occurred while saving your profile. Please try again.');
        });
    });
}

// Main screen event listeners
function bindMainScreenEvents() {
    // Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const sectionId = item.getAttribute('data-section');
            document.querySelectorAll('.content-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`${sectionId}-section`).classList.add('active');
        });
    });
    
    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        fetch('/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(() => {
            localStorage.removeItem('userId');
            localStorage.removeItem('username');
            userId = null;
            
            // Disconnect socket
            if (socket) {
                socket.disconnect();
            }
            
            showScreen('auth-screen');
        })
        .catch(error => {
            console.error('Logout error:', error);
        });
    });
    
    // Profile edit form
    document.getElementById('edit-profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const height = document.getElementById('edit-height').value;
        const weight = document.getElementById('edit-weight').value;
        const bloodType = document.getElementById('edit-blood-type').value;
        const allergies = document.getElementById('edit-allergies').value;
        const medicalConditions = document.getElementById('edit-medical-conditions').value;
        const emergencyContact = document.getElementById('edit-emergency-contact').value;
        const language = document.getElementById('edit-language').value;
        
        fetch('/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                height,
                weight,
                blood_type: bloodType,
                allergies,
                medical_conditions: medicalConditions,
                emergency_contact: emergencyContact,
                preferred_language: language
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                alert('Profile updated successfully!');
            }
        })
        .catch(error => {
            console.error('Profile update error:', error);
            alert('An error occurred while updating your profile. Please try again.');
        });
    });
}

// Medication related event listeners
function bindMedicationEvents() {
    // Open add medication modal
    document.getElementById('add-medication-btn').addEventListener('click', () => {
        const modal = document.getElementById('add-medication-modal');
        modal.classList.add('active');
    });
    
    // Close medication modal
    const closeButtons = document.querySelectorAll('.close-modal');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            modal.classList.remove('active');
        });
    });
    
    // Add medication form submission
    document.getElementById('add-medication-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('medication-name').value;
        const dosage = document.getElementById('medication-dosage').value;
        const frequency = document.getElementById('medication-frequency').value;
        const timeOfDay = document.getElementById('medication-time').value;
        const notes = document.getElementById('medication-notes').value;
        
        fetch('/medications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                dosage,
                frequency,
                time_of_day: timeOfDay,
                notes
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                // Close modal and reset form
                document.getElementById('add-medication-modal').classList.remove('active');
                document.getElementById('add-medication-form').reset();
                
                // Reload medications
                loadMedications();
                
                // Refresh ChatIntelligence local data
                chatIntelligence.refreshLocalData();
                
                alert('Medication added successfully!');
            }
        })
        .catch(error => {
            console.error('Add medication error:', error);
            alert('An error occurred while adding the medication. Please try again.');
        });
    });
}

// Appointment related event listeners
function bindAppointmentEvents() {
    // Open add appointment modal
    document.getElementById('add-appointment-btn').addEventListener('click', () => {
        const modal = document.getElementById('add-appointment-modal');
        modal.classList.add('active');
    });
    
    // Add appointment form submission
    document.getElementById('add-appointment-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const doctorName = document.getElementById('doctor-name').value;
        const specialty = document.getElementById('doctor-specialty').value;
        const location = document.getElementById('appointment-location').value;
        const date = document.getElementById('appointment-date').value;
        const time = document.getElementById('appointment-time').value;
        const purpose = document.getElementById('appointment-purpose').value;
        const notes = document.getElementById('appointment-notes').value;
        
        // Combine date and time
        const dateTime = new Date(`${date}T${time}`);
        
        fetch('/appointments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                doctor_name: doctorName,
                specialty,
                location,
                date_time: dateTime.toISOString(),
                purpose,
                notes
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                // Close modal and reset form
                document.getElementById('add-appointment-modal').classList.remove('active');
                document.getElementById('add-appointment-form').reset();
                
                // Reload appointments
                loadAppointments();
                
                // Refresh ChatIntelligence local data
                chatIntelligence.refreshLocalData();
                
                alert('Appointment added successfully!');
            }
        })
        .catch(error => {
            console.error('Add appointment error:', error);
            alert('An error occurred while adding the appointment. Please try again.');
        });
    });
}

// Timer related event listeners
function bindTimerEvents() {
    // Open add timer modal
    document.getElementById('add-timer-btn').addEventListener('click', () => {
        const modal = document.getElementById('add-timer-modal');
        modal.classList.add('active');
    });
    
    // Add timer form submission
    document.getElementById('add-timer-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = document.getElementById('timer-name').value;
        const hours = parseInt(document.getElementById('timer-hours').value) || 0;
        const minutes = parseInt(document.getElementById('timer-minutes').value) || 0;
        const seconds = parseInt(document.getElementById('timer-seconds').value) || 0;
        
        // Calculate total duration in seconds
        const duration = (hours * 3600) + (minutes * 60) + seconds;
        
        if (duration <= 0) {
            alert('Please set a valid duration for the timer');
            return;
        }
        
        fetch('/timers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                duration
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert(data.error);
            } else {
                // Close modal and reset form
                document.getElementById('add-timer-modal').classList.remove('active');
                document.getElementById('add-timer-form').reset();
                
                // Reload timers
                loadTimers();
                
                // Refresh ChatIntelligence local data
                chatIntelligence.refreshLocalData();
                
                alert('Timer created successfully!');
            }
        })
        .catch(error => {
            console.error('Add timer error:', error);
            alert('An error occurred while creating the timer. Please try again.');
        });
    });
}

// Notification related event listeners
function bindNotificationEvents() {
    // Open notification panel
    document.querySelector('.notification-bell').addEventListener('click', () => {
        document.getElementById('notification-panel').classList.add('active');
    });
    
    // Close notification panel
    document.getElementById('close-notifications').addEventListener('click', () => {
        document.getElementById('notification-panel').classList.remove('active');
    });
}

// Chat related event listeners
function bindChatEvents() {
    // Send message button
    document.getElementById('send-message-btn').addEventListener('click', sendChatMessage);
    
    // Enter key to send message
    document.getElementById('chat-input-field').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Voice input button
    document.getElementById('voice-input-btn').addEventListener('click', startVoiceRecognition);
    
    // Stop recording button
    document.getElementById('stop-recording-btn').addEventListener('click', stopVoiceRecognition);
}

// Function to send chat message
async function sendChatMessage() {
    const input = document.getElementById('chat-input-field');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Clear input field
    input.value = '';
    
    // Add user message to chat
    addMessageToChat(message, 'user');
    
    try {
        // Process message with ChatIntelligence
        const response = await chatIntelligence.processMessage(message);
        
        // Add AI response to chat
        addMessageToChat(response, 'assistant');
        
        // Use text-to-speech for response
        if (voiceAssistant) {
            voiceAssistant.speak(response);
        }
    } catch (error) {
        console.error('Chat processing error:', error);
        const errorMsg = 'Sorry, I encountered an error. Please try again.';
        addMessageToChat(errorMsg, 'assistant');
        if (voiceAssistant) {
            voiceAssistant.speak(errorMsg);
        }
    }
}

// Function to add message to chat
function addMessageToChat(message, sender) {
    const chatMessages = document.getElementById('chat-messages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = sender === 'user' ? 'user-message' : 'assistant-message';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    
    const icon = document.createElement('i');
    icon.className = sender === 'user' ? 'fas fa-user' : 'fas fa-robot';
    
    avatarDiv.appendChild(icon);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Split message by newlines and create paragraph for each
    const paragraphs = message.split('\n').filter(p => p.trim() !== '');
    paragraphs.forEach(paragraph => {
        const p = document.createElement('p');
        p.textContent = paragraph;
        contentDiv.appendChild(p);
    });
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Voice recognition functions
function startVoiceRecognition() {
    voiceAssistant.startListening();
}

function stopVoiceRecognition() {
    voiceAssistant.stopListening();
}

// Function to show a specific screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Main app initialization
async function initializeApp() {
    // Load user profile
    loadUserProfile();
    
    // Load medications
    loadMedications();
    
    // Load appointments
    loadAppointments();
    
    // Load timers
    loadTimers();
    
    // Load health insights
    loadHealthInsights();
    
    // Initialize WebSocket
    initializeSocket();
    
    // Initialize ChatIntelligence
    await chatIntelligence.initialize();
    
    // Dispatch event to signal app initialization is complete
    document.dispatchEvent(new Event('appInitialized'));
}

// Load user profile
function loadUserProfile() {
    fetch('/profile', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        // Update profile section
        document.getElementById('profile-name').textContent = data.username;
        document.getElementById('profile-email').textContent = data.email;
        
        // Update form fields
        document.getElementById('edit-height').value = data.height || '';
        document.getElementById('edit-weight').value = data.weight || '';
        document.getElementById('edit-blood-type').value = data.blood_type || '';
        document.getElementById('edit-allergies').value = data.allergies || '';
        document.getElementById('edit-medical-conditions').value = data.medical_conditions || '';
        document.getElementById('edit-emergency-contact').value = data.emergency_contact || '';
        document.getElementById('edit-language').value = data.preferred_language || 'en-US';
    })
    .catch(error => {
        console.error('Error loading profile:', error);
    });
}

// Load medications
function loadMedications() {
    fetch('/medications', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(medications => {
        // Update medications table
        const tableBody = document.getElementById('medications-table-body');
        tableBody.innerHTML = '';
        
        if (medications.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="6" class="empty-list">No medications added yet</td>`;
            tableBody.appendChild(emptyRow);
        } else {
            medications.forEach(med => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${med.name}</td>
                    <td>${med.dosage}</td>
                    <td>${med.frequency}</td>
                    <td>${med.time_of_day}</td>
                    <td><span class="status-pill status-${med.status.toLowerCase()}">${med.status}</span></td>
                    <td class="table-actions">
                        <button class="edit-btn" data-id="${med.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" data-id="${med.id}"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
            
            // Add event listeners to edit and delete buttons
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const medicationId = btn.getAttribute('data-id');
                    // Add edit functionality here
                    alert(`Edit medication with ID: ${medicationId}`);
                });
            });
            
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const medicationId = btn.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this medication?')) {
                        deleteMedication(medicationId);
                    }
                });
            });
        }
        
        // Update dashboard card
        const upcomingMeds = medications.filter(med => med.status === 'Pending');
        const medList = document.getElementById('medication-list');
        const medCount = document.getElementById('medication-count');
        
        medCount.textContent = upcomingMeds.length;
        medList.innerHTML = '';
        
        if (upcomingMeds.length === 0) {
            medList.innerHTML = '<li class="empty-list">No upcoming medications</li>';
        } else {
            upcomingMeds.slice(0, 3).forEach(med => {
                const li = document.createElement('li');
                li.textContent = `${med.name} (${med.dosage}) - ${med.time_of_day}`;
                medList.appendChild(li);
            });
        }
    })
    .catch(error => {
        console.error('Error loading medications:', error);
    });
}

// Delete medication
function deleteMedication(medicationId) {
    fetch(`/medications/${medicationId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            // Reload medications
            loadMedications();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
            
            alert('Medication deleted successfully!');
        }
    })
    .catch(error => {
        console.error('Delete medication error:', error);
        alert('An error occurred while deleting the medication. Please try again.');
    });
}

// Load appointments
function loadAppointments() {
    fetch('/appointments', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(appointments => {
        // Update appointments table
        const tableBody = document.getElementById('appointments-table-body');
        tableBody.innerHTML = '';
        
        if (appointments.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = `<td colspan="7" class="empty-list">No appointments scheduled yet</td>`;
            tableBody.appendChild(emptyRow);
        } else {
            appointments.forEach(appt => {
                const date = new Date(appt.date_time);
                const formattedDate = date.toLocaleDateString();
                const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${appt.doctor_name}</td>
                    <td>${appt.specialty || '-'}</td>
                    <td>${appt.location}</td>
                    <td>${formattedDate} ${formattedTime}</td>
                    <td>${appt.purpose || '-'}</td>
                    <td><span class="status-pill status-${appt.status.toLowerCase()}">${appt.status}</span></td>
                    <td class="table-actions">
                        <button class="edit-btn" data-id="${appt.id}"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" data-id="${appt.id}"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
            
            // Add event listeners to edit and delete buttons
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const appointmentId = btn.getAttribute('data-id');
                    // Add edit functionality here
                    alert(`Edit appointment with ID: ${appointmentId}`);
                });
            });
            
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const appointmentId = btn.getAttribute('data-id');
                    if (confirm('Are you sure you want to delete this appointment?')) {
                        deleteAppointment(appointmentId);
                    }
                });
            });
        }
        
        // Update dashboard card
        const upcomingAppts = appointments.filter(appt => appt.status === 'Scheduled');
        const apptList = document.getElementById('appointment-list');
        const apptCount = document.getElementById('appointment-count');
        
        apptCount.textContent = upcomingAppts.length;
        apptList.innerHTML = '';
        
        if (upcomingAppts.length === 0) {
            apptList.innerHTML = '<li class="empty-list">No upcoming appointments</li>';
        } else {
            upcomingAppts.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
            upcomingAppts.slice(0, 3).forEach(appt => {
                const date = new Date(appt.date_time);
                const formattedDate = date.toLocaleDateString();
                const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                const li = document.createElement('li');
                li.textContent = `Dr. ${appt.doctor_name} - ${formattedDate} ${formattedTime}`;
                apptList.appendChild(li);
            });
        }
    })
    .catch(error => {
        console.error('Error loading appointments:', error);
    });
}

// Delete appointment
function deleteAppointment(appointmentId) {
    fetch(`/appointments/${appointmentId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            // Reload appointments
            loadAppointments();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
            
            alert('Appointment deleted successfully!');
        }
    })
    .catch(error => {
        console.error('Delete appointment error:', error);
        alert('An error occurred while deleting the appointment. Please try again.');
    });
}

// Load timers
function loadTimers() {
    fetch('/timers', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(timers => {
        // Update timers grid
        const timersGrid = document.getElementById('timers-grid');
        timersGrid.innerHTML = '';
        
        if (timers.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <i class="fas fa-clock empty-icon"></i>
                <p>No timers yet. Add a timer for your medical tasks.</p>
            `;
            timersGrid.appendChild(emptyState);
        } else {
            timers.forEach(timer => {
                const timerCard = document.createElement('div');
                timerCard.className = 'timer-card';
                timerCard.id = `timer-${timer.id}`;
                
                let displayTime = formatTime(timer.duration);
                let timerStatus = timer.status;
                
                // Create timer controls based on status
                let controlsHtml = '';
                if (timerStatus === 'Ready') {
                    controlsHtml = `
                        <button class="timer-btn start-btn" data-id="${timer.id}"><i class="fas fa-play"></i></button>
                    `;
                } else if (timerStatus === 'Running') {
                    // Calculate remaining time
                    const endTime = new Date(timer.end_time);
                    const now = new Date();
                    const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
                    
                    displayTime = formatTime(remainingSeconds);
                    
                    controlsHtml = `
                        <button class="timer-btn pause-btn" data-id="${timer.id}"><i class="fas fa-pause"></i></button>
                        <button class="timer-btn reset-btn" data-id="${timer.id}"><i class="fas fa-undo"></i></button>
                    `;
                    
                    // Add to active timers for updating
                    if (!currentActiveTimers.includes(timer.id)) {
                        currentActiveTimers.push(timer.id);
                        updateTimer(timer.id, endTime);
                    }
                } else if (timerStatus === 'Paused') {
                    controlsHtml = `
                        <button class="timer-btn start-btn" data-id="${timer.id}"><i class="fas fa-play"></i></button>
                        <button class="timer-btn reset-btn" data-id="${timer.id}"><i class="fas fa-undo"></i></button>
                    `;
                } else if (timerStatus === 'Completed') {
                    displayTime = "00:00:00";
                    controlsHtml = `
                        <button class="timer-btn reset-btn" data-id="${timer.id}"><i class="fas fa-undo"></i></button>
                    `;
                }
                
                timerCard.innerHTML = `
                    <div class="timer-name">${timer.name}</div>
                    <div class="timer-display">${displayTime}</div>
                    <div class="timer-status">
                        <span class="status-pill status-${timerStatus.toLowerCase()}">${timerStatus}</span>
                    </div>
                    <div class="timer-controls">
                        ${controlsHtml}
                    </div>
                `;
                
                timersGrid.appendChild(timerCard);
            });
            
            // Add event listeners to timer controls
            document.querySelectorAll('.start-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const timerId = btn.getAttribute('data-id');
                    startTimer(timerId);
                });
            });
            
            document.querySelectorAll('.pause-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const timerId = btn.getAttribute('data-id');
                    pauseTimer(timerId);
                });
            });
            
            document.querySelectorAll('.reset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const timerId = btn.getAttribute('data-id');
                    resetTimer(timerId);
                });
            });
        }
        
        // Update dashboard active timers
        const activeTimers = timers.filter(timer => timer.status === 'Running');
        const timerList = document.getElementById('timer-list');
        
        timerList.innerHTML = '';
        
        if (activeTimers.length === 0) {
            timerList.innerHTML = '<li class="empty-list">No active timers</li>';
        } else {
            activeTimers.forEach(timer => {
                const li = document.createElement('li');
                const endTime = new Date(timer.end_time);
                const now = new Date();
                const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
                
                li.textContent = `${timer.name} - ${formatTime(remainingSeconds)} remaining`;
                timerList.appendChild(li);
            });
        }
    })
    .catch(error => {
        console.error('Error loading timers:', error);
    });
}

// Timer control functions
function startTimer(timerId) {
    fetch(`/timers/${timerId}/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            // Reload timers
            loadTimers();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
    })
    .catch(error => {
        console.error('Start timer error:', error);
        alert('An error occurred while starting the timer. Please try again.');
    });
}

function pauseTimer(timerId) {
    // Implement pause timer functionality
    fetch(`/timers/${timerId}/pause`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            // Reload timers
            loadTimers();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
    })
    .catch(error => {
        console.error('Pause timer error:', error);
        alert('An error occurred while pausing the timer. Please try again.');
    });
}

function resetTimer(timerId) {
    // Implement reset timer functionality
    fetch(`/timers/${timerId}/reset`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
        } else {
            // Reload timers
            loadTimers();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
    })
    .catch(error => {
        console.error('Reset timer error:', error);
        alert('An error occurred while resetting the timer. Please try again.');
    });
}

function updateTimer(timerId, endTime) {
    const timerElement = document.querySelector(`#timer-${timerId} .timer-display`);
    
    if (!timerElement) return;
    
    const interval = setInterval(() => {
        const now = new Date();
        const remainingSeconds = Math.max(0, Math.floor((endTime - now) / 1000));
        
        timerElement.textContent = formatTime(remainingSeconds);
        
        // Update dashboard timer list
        const timerListItem = Array.from(document.querySelectorAll('#timer-list li')).find(li => 
            li.textContent.includes(document.querySelector(`#timer-${timerId} .timer-name`).textContent)
        );
        
        if (timerListItem) {
            timerListItem.textContent = `${document.querySelector(`#timer-${timerId} .timer-name`).textContent} - ${formatTime(remainingSeconds)} remaining`;
        }
        
        if (remainingSeconds <= 0) {
            clearInterval(interval);
            
            // Remove from active timers
            currentActiveTimers = currentActiveTimers.filter(id => id !== timerId);
            
            // Reload timers to update UI
            loadTimers();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
    }, 1000);
}

// Format time (seconds) to HH:MM:SS
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
}

// Load health insights
function loadHealthInsights() {
    fetch('/insights', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(insights => {
        // Update insights grid
        const insightsGrid = document.getElementById('insights-grid');
        insightsGrid.innerHTML = '';
        
        if (insights.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <i class="fas fa-lightbulb empty-icon"></i>
                <p>No health insights yet. They will be generated based on your profile and activities.</p>
            `;
            insightsGrid.appendChild(emptyState);
        } else {
            insights.forEach(insight => {
                const date = new Date(insight.generated_at);
                const formattedDate = date.toLocaleDateString();
                const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                const card = document.createElement('div');
                card.className = `insight-card${insight.is_read ? '' : ' unread'}`;
                card.dataset.id = insight.id;
                
                card.innerHTML = `
                    <div class="insight-type">${insight.type}</div>
                    <div class="insight-content">${insight.content}</div>
                    <div class="insight-date">${formattedDate} ${formattedTime}</div>
                `;
                
                card.addEventListener('click', () => {
                    markInsightAsRead(insight.id);
                });
                
                insightsGrid.appendChild(card);
            });
        }
        
        // Update dashboard insights
        const insightList = document.getElementById('insight-list');
        insightList.innerHTML = '';
        
        if (insights.length === 0) {
            insightList.innerHTML = '<li class="empty-list">No health insights yet</li>';
        } else {
            insights.slice(0, 3).forEach(insight => {
                const li = document.createElement('li');
                li.textContent = truncateText(insight.content, 100);
                insightList.appendChild(li);
            });
        }
    })
    .catch(error => {
        console.error('Error loading insights:', error);
    });
}

// Mark insight as read
function markInsightAsRead(insightId) {
    fetch(`/insights/${insightId}/read`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (!data.error) {
            // Update UI
            const insightCard = document.querySelector(`.insight-card[data-id="${insightId}"]`);
            if (insightCard) {
                insightCard.classList.remove('unread');
            }
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
    })
    .catch(error => {
        console.error('Error marking insight as read:', error);
    });
}

// Initialize WebSocket
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to WebSocket');
        
        // Join user-specific channel
        socket.emit('join_user_channel', { user_id: userId });
    });
    
    socket.on(`notification_${userId}`, (notification) => {
        // Handle notification
        console.log('New notification:', notification);
        
        // Create notification item
        addNotification(notification);
        
        // Update notification count
        updateNotificationCount();
        
        // If it's a timer completion, update timers
        if (notification.type === 'timer_completed') {
            loadTimers();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
        
        // If it's a health insight, update insights
        if (notification.type === 'health_insight') {
            loadHealthInsights();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
        
        // If it's a medication reminder, update medications
        if (notification.type === 'medication_reminder') {
            loadMedications();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
        
        // If it's an appointment reminder, update appointments
        if (notification.type === 'appointment_reminder') {
            loadAppointments();
            
            // Refresh ChatIntelligence local data
            chatIntelligence.refreshLocalData();
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket');
    });
}

// Add notification
function addNotification(notification) {
    const notificationList = document.getElementById('notification-list');
    
    // Remove empty state if exists
    const emptyState = notificationList.querySelector('.empty-notifications');
    if (emptyState) {
        notificationList.removeChild(emptyState);
    }
    
    const notificationItem = document.createElement('div');
    notificationItem.className = 'notification-item unread';
    
    // Set notification time
    const now = new Date();
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Set notification content based on type
    let title = notification.title;
    let message = notification.message;
    let onClick = null;
    
    if (notification.type === 'medication_reminder') {
        onClick = () => handleMedicationReminder(notification.medication_id, notification.reminder_id);
    } else if (notification.type === 'appointment_reminder') {
        onClick = () => handleAppointmentReminder(notification.appointment_id);
    } else if (notification.type === 'timer_completed') {
        onClick = () => handleTimerCompletion(notification.timer_id);
    } else if (notification.type === 'health_insight') {
        onClick = () => handleHealthInsight(notification.insight_id);
    }
    
    notificationItem.innerHTML = `
        <div class="notification-title">${title}</div>
        <div class="notification-message">${message}</div>
        <div class="notification-time">${formattedTime}</div>
    `;
    
    if (onClick) {
        notificationItem.addEventListener('click', onClick);
    }
    
    // Add to top of list
    notificationList.insertBefore(notificationItem, notificationList.firstChild);
    
    // Play notification sound
    playNotificationSound();
}

// Update notification count
function updateNotificationCount() {
    const count = document.querySelectorAll('.notification-item.unread').length;
    const countElement = document.getElementById('notification-count');
    
    countElement.textContent = count;
    countElement.style.display = count > 0 ? 'flex' : 'none';
}

// Play notification sound
function playNotificationSound() {
    const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...'); // Replace with actual base64 sound data
    audio.play().catch(e => console.error('Error playing notification sound:', e));
}

// Handle medication reminder
function handleMedicationReminder(medicationId, reminderId) {
    if (confirm('Have you taken this medication?')) {
        socket.emit('medication_taken', {
            medication_id: medicationId,
            reminder_id: reminderId
        });
        
        // Mark notification as read
        event.currentTarget.classList.remove('unread');
        updateNotificationCount();
        
        // Reload medications
        loadMedications();
        
        // Refresh ChatIntelligence local data
        chatIntelligence.refreshLocalData();
    }
}

// Handle appointment reminder
function handleAppointmentReminder(appointmentId) {
    // Mark notification as read
    event.currentTarget.classList.remove('unread');
    updateNotificationCount();
    
    // Navigate to appointments tab
    document.querySelector('.nav-item[data-section="appointments"]').click();
}

// Handle timer completion
function handleTimerCompletion(timerId) {
    // Mark notification as read
    event.currentTarget.classList.remove('unread');
    updateNotificationCount();
    
    // Navigate to timers tab
    document.querySelector('.nav-item[data-section="timers"]').click();
}

// Handle health insight
function handleHealthInsight(insightId) {
    // Mark notification as read
    event.currentTarget.classList.remove('unread');
    updateNotificationCount();
    
    // Mark insight as read
    markInsightAsRead(insightId);
    
    // Navigate to insights tab
    document.querySelector('.nav-item[data-section="insights"]').click();
}

// Helper function to truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Add contains selector for jQuery-like functionality
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        var el = this;
        do {
            if (Element.prototype.matches.call(el, s)) return el;
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}