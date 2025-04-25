# AI Medical Assistant

A comprehensive healthcare management application powered by AI to help users manage medications, appointments, and receive personalized health insights.

![AI Medical Assistant](https://img.shields.io/badge/AI-Medical%20Assistant-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🌟 Features

- **AI-Powered Conversations**: Chat with an AI assistant about health concerns using Google's Gemini API
- **Voice Interaction**: Voice-based interaction with speech synthesis responses
- **Medication Management**: Track medications with automated reminders
- **Appointment Tracking**: Manage doctor appointments with timely notifications
- **Health Insights**: Receive daily personalized health tips based on your medical profile
- **Timer Functionality**: Set timers for health-related activities
- **Medical Profile**: Store important medical information securely
- **Real-time Notifications**: Get timely alerts via WebSocket

## 🔧 Technologies Used

- **Backend**: Flask, SQLAlchemy, Flask-SocketIO
- **Database**: SQLite
- **AI**: Google Generative AI (Gemini Pro/1.5)
- **Voice**: Google Cloud Text-to-Speech
- **Frontend**: HTML, CSS, JavaScript (frontend code not included in this repository)

## 📋 Prerequisites

- Python 3.8+
- Google Cloud account with:
  - Gemini API access
  - Text-to-Speech API enabled
- Google application credentials JSON file

## 🚀 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ai-medical-assistant.git
   cd ai-medical-assistant
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Set up environment variables:
   ```bash
   export GEMINI_API_KEY=your_gemini_api_key
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
   ```

5. Initialize the database:
   ```bash
   python -c "from app import app, db; app.app_context().push(); db.create_all()"
   ```

6. Run the application:
   ```bash
   python app.py
   ```

## 💻 Usage

### User Registration and Authentication

```python
# Register a new user
POST /register
{
    "username": "user123",
    "email": "user@example.com",
    "password": "securepassword"
}

# Login
POST /login
{
    "username": "user123",
    "password": "securepassword"
}
```

### Medical Profile Management

```python
# Update medical profile
POST /profile
{
    "height": 175,
    "weight": 70,
    "blood_type": "O+",
    "allergies": "Penicillin",
    "medical_conditions": "Asthma",
    "emergency_contact": "John Doe - 555-1234",
    "preferred_language": "en-US"
}
```

### Medication Management

```python
# Add a new medication
POST /medications
{
    "name": "Amoxicillin",
    "dosage": "500mg",
    "frequency": "daily",
    "time_of_day": "8:00 AM, 8:00 PM",
    "start_date": "2025-04-25T00:00:00",
    "end_date": "2025-05-02T00:00:00",
    "notes": "Take with food"
}
```

### Appointment Management

```python
# Schedule a doctor appointment
POST /appointments
{
    "doctor_name": "Dr. Smith",
    "specialty": "Cardiologist",
    "location": "123 Medical Center",
    "date_time": "2025-05-10T14:30:00",
    "purpose": "Annual checkup",
    "notes": "Bring previous test results"
}
```

### AI Interaction

```python
# Chat with AI assistant
POST /ai/chat
{
    "message": "What are some tips for managing my asthma?"
}

# Voice interaction
POST /ai/voice
{
    "message": "How should I take my medications?"
}
```

## 🔄 Real-time Notifications

The application uses WebSocket connections (Socket.IO) to deliver real-time notifications for:
- Medication reminders
- Appointment alerts
- Timer completions
- Daily health insights

## 🛠️ Project Structure

```
ai-medical-assistant/
├── app.py                  # Main application file
├── static/                 # CSS, JS, and other static files
├── templates/              # HTML templates
│   └── index.html          # Main application page
├── instance/               # Database instance
│   └── medical_assistant.db
└── README.md               # This file
```

## 🔒 Security Features

- Password hashing with Werkzeug security
- Session-based authentication
- Secure secret key generation

## 🚫 Limitations

- Currently only supports English and user-specified languages for voice
- Medication reminder scheduling has limited recurrence options
- No multi-factor authentication implemented yet

## 📝 Future Enhancements

- Add multi-language support for AI conversations
- Implement symptom tracking and analysis
- Develop mobile application version
- Add data visualization for health trends
- Implement multi-factor authentication
- Add support for exporting medical data

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

Your Name - [@yourgithub](https://github.com/Richiemaja04)

## 🙏 Acknowledgements

- Google for providing Gemini AI and Text-to-Speech APIs
- Flask community for the excellent web framework
- Open source contributors whose libraries made this project possible
