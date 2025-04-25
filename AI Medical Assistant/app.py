from flask import Flask, request, jsonify, render_template, session
from flask_socketio import SocketIO, emit
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import threading
import time
import requests
import json
import os
from werkzeug.security import generate_password_hash, check_password_hash
import google.generativeai as genai
from google.cloud import texttospeech
import base64
import re
import random
import secrets

your_secret_key_here=secrets.token_hex(16)

app = Flask(__name__)
app.config['SECRET_KEY'] = your_secret_key_here
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///medical_assistant.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Configure Google Gemini API
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', 'your_gemini_api_key_here')
genai.configure(api_key=GEMINI_API_KEY)

# Configure Google Cloud TTS
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"path_to_your_google_cloud_credentials.json"

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Medical profile data
    height = db.Column(db.Float)
    weight = db.Column(db.Float)
    blood_type = db.Column(db.String(10))
    allergies = db.Column(db.Text)
    medical_conditions = db.Column(db.Text)
    emergency_contact = db.Column(db.String(100))
    preferred_language = db.Column(db.String(50), default='en')

    medications = db.relationship('Medication', backref='user', lazy=True)
    appointments = db.relationship('Appointment', backref='user', lazy=True)
    timers = db.relationship('Timer', backref='user', lazy=True)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Medication(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    dosage = db.Column(db.String(50), nullable=False)
    frequency = db.Column(db.String(100), nullable=False)
    time_of_day = db.Column(db.String(100), nullable=False)
    start_date = db.Column(db.DateTime, default=datetime.utcnow)
    end_date = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), default='Pending')  # Taken, Pending, Missed
    notes = db.Column(db.Text, nullable=True)
    
    reminders = db.relationship('MedicationReminder', backref='medication', lazy=True)

class MedicationReminder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    medication_id = db.Column(db.Integer, db.ForeignKey('medication.id'), nullable=False)
    scheduled_time = db.Column(db.DateTime, nullable=False)
    is_sent = db.Column(db.Boolean, default=False)
    is_acknowledged = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(20), default='Pending')  # Sent, Acknowledged, Dismissed

class Appointment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    doctor_name = db.Column(db.String(100), nullable=False)
    specialty = db.Column(db.String(100), nullable=True)
    location = db.Column(db.String(200), nullable=False)
    date_time = db.Column(db.DateTime, nullable=False)
    purpose = db.Column(db.String(200), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='Scheduled')  # Scheduled, Completed, Cancelled, Rescheduled
    
    reminders = db.relationship('AppointmentReminder', backref='appointment', lazy=True)

class AppointmentReminder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointment.id'), nullable=False)
    reminder_time = db.Column(db.DateTime, nullable=False)
    is_sent = db.Column(db.Boolean, default=False)

class Timer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    duration = db.Column(db.Integer, nullable=False)  # Duration in seconds
    start_time = db.Column(db.DateTime, nullable=True)
    end_time = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), default='Ready')  # Ready, Running, Paused, Completed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message = db.Column(db.Text, nullable=False)
    response = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    interaction_type = db.Column(db.String(10), default='chat')  # chat or voice

class HealthInsight(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    insight_type = db.Column(db.String(50), nullable=False)  # hydration, exercise, mental, medication, etc.
    content = db.Column(db.Text, nullable=False)
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)

with app.app_context():
    db.create_all()

# Background task for checking reminders
def check_reminders():
    with app.app_context():
        while True:
            current_time = datetime.utcnow()
            
            # Check medication reminders
            medication_reminders = MedicationReminder.query.filter_by(is_sent=False).all()
            for reminder in medication_reminders:
                if reminder.scheduled_time <= current_time:
                    medication = Medication.query.get(reminder.medication_id)
                    user = User.query.get(medication.user_id)
                    
                    notification = {
                        'type': 'medication_reminder',
                        'user_id': user.id,
                        'title': 'Medication Reminder',
                        'message': f"Time to take your {medication.name} ({medication.dosage})",
                        'medication_id': medication.id,
                        'reminder_id': reminder.id
                    }
                    
                    socketio.emit(f'notification_{user.id}', notification)
                    reminder.is_sent = True
                    db.session.commit()
            
            # Check appointment reminders
            appointment_reminders = AppointmentReminder.query.filter_by(is_sent=False).all()
            for reminder in appointment_reminders:
                if reminder.reminder_time <= current_time:
                    appointment = Appointment.query.get(reminder.appointment_id)
                    user = User.query.get(appointment.user_id)
                    
                    notification = {
                        'type': 'appointment_reminder',
                        'user_id': user.id,
                        'title': 'Appointment Reminder',
                        'message': f"You have an appointment with Dr. {appointment.doctor_name} at {appointment.date_time.strftime('%I:%M %p')} for {appointment.purpose}",
                        'appointment_id': appointment.id,
                        'reminder_id': reminder.id
                    }
                    
                    socketio.emit(f'notification_{user.id}', notification)
                    reminder.is_sent = True
                    db.session.commit()
            
            # Check active timers
            active_timers = Timer.query.filter_by(status='Running').all()
            for timer in active_timers:
                if timer.start_time and timer.end_time and timer.end_time <= current_time:
                    user = User.query.get(timer.user_id)
                    
                    notification = {
                        'type': 'timer_completed',
                        'user_id': user.id,
                        'title': 'Timer Completed',
                        'message': f"Your timer for {timer.name} has completed",
                        'timer_id': timer.id
                    }
                    
                    socketio.emit(f'notification_{user.id}', notification)
                    timer.status = 'Completed'
                    db.session.commit()
            
            # Generate daily health insights (once per day)
            if current_time.hour == 8 and current_time.minute == 0:  # At 8:00 AM
                users = User.query.all()
                for user in users:
                    generate_health_insights(user.id)
            
            time.sleep(30)  # Check every 30 seconds

# Start the background task for checking reminders
reminder_thread = threading.Thread(target=check_reminders)
reminder_thread.daemon = True
reminder_thread.start()

# Helper functions
def generate_ai_response(prompt, user_id):
    """Generate response using Gemini API with user context"""
    try:
        # Get user medical profile for context
        user = User.query.get(user_id)
        
        # Add medical context to prompt
        context = f"""
        User Medical Profile:
        - Height: {user.height}cm
        - Weight: {user.weight}kg
        - Blood Type: {user.blood_type}
        - Allergies: {user.allergies}
        - Medical Conditions: {user.medical_conditions}
        
        As a medical assistant, provide a helpful response based on this profile.
        """
        
        full_prompt = context + "\n\nUser Query: " + prompt
        
        # Generate response using Gemini
        model = genai.GenerativeModel('gemini-1.5-pro-latest')
        response = model.generate_content(full_prompt)
        
        # Save conversation to database
        conversation = Conversation(
            user_id=user_id,
            message=prompt,
            response=response.text,
            interaction_type='chat'
        )
        db.session.add(conversation)
        db.session.commit()
        
        return response.text
    except Exception as e:
        print(f"Error generating AI response: {e}")
        return "I'm sorry, I encountered an error processing your request. Please try again later."

def text_to_speech(text, language_code='en-US'):
    """Convert text to speech using Google Cloud TTS"""
    try:
        client = texttospeech.TextToSpeechClient()
        
        synthesis_input = texttospeech.SynthesisInput(text=text)
        
        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
        )
        
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3
        )
        
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
        
        # Encode audio content to base64 for sending through WebSocket
        audio_content = base64.b64encode(response.audio_content).decode('utf-8')
        return audio_content
    except Exception as e:
        print(f"Error in text-to-speech conversion: {e}")
        return None

def generate_health_insights(user_id):
    """Generate personalized health insights for a user"""
    try:
        user = User.query.get(user_id)
        
        # Get user's recent activity and status
        recent_medications = Medication.query.filter_by(user_id=user_id).order_by(Medication.id.desc()).limit(5).all()
        upcoming_appointments = Appointment.query.filter_by(user_id=user_id, status='Scheduled').order_by(Appointment.date_time).limit(3).all()
        
        # Construct context for AI
        context = f"""
        Generate a personalized health insight for a user with the following profile:
        - Height: {user.height}cm
        - Weight: {user.weight}kg
        - Blood Type: {user.blood_type}
        - Allergies: {user.allergies}
        - Medical Conditions: {user.medical_conditions}
        
        Recent medications: {', '.join([m.name for m in recent_medications])}
        Upcoming appointments: {', '.join([f"Dr. {a.doctor_name} on {a.date_time.strftime('%Y-%m-%d')}" for a in upcoming_appointments])}
        
        Generate one concise health tip that would be valuable for this user's wellbeing today.
        """
        
        # Generate insight using Gemini
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(context)
        
        # Create health insight
        insight = HealthInsight(
            user_id=user_id,
            insight_type='daily',
            content=response.text
        )
        db.session.add(insight)
        db.session.commit()
        
        # Send notification to user
        notification = {
            'type': 'health_insight',
            'user_id': user_id,
            'title': 'Daily Health Insight',
            'message': response.text,
            'insight_id': insight.id
        }
        
        socketio.emit(f'notification_{user_id}', notification)
        
        return response.text
    except Exception as e:
        print(f"Error generating health insight: {e}")
        return None

def parse_natural_language_date(text):
    """Parse natural language date/time expressions"""
    current_time = datetime.utcnow()
    
    # Match patterns like "tomorrow at 2pm", "in 3 days", "next Monday", etc.
    if "tomorrow" in text.lower():
        return current_time + timedelta(days=1)
    elif "today" in text.lower():
        return current_time
    elif re.search(r"in (\d+) days?", text.lower()):
        match = re.search(r"in (\d+) days?", text.lower())
        days = int(match.group(1))
        return current_time + timedelta(days=days)
    elif re.search(r"in (\d+) hours?", text.lower()):
        match = re.search(r"in (\d+) hours?", text.lower())
        hours = int(match.group(1))
        return current_time + timedelta(hours=hours)
    elif re.search(r"(\d+)(am|pm)", text.lower()):
        match = re.search(r"(\d+)(am|pm)", text.lower())
        hour = int(match.group(1))
        ampm = match.group(2)
        
        if ampm.lower() == "pm" and hour < 12:
            hour += 12
        
        result = current_time.replace(hour=hour, minute=0, second=0, microsecond=0)
        return result
    
    # Default to current time if no pattern matches
    return current_time

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    
    # Check if username or email already exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    # Create new user
    user = User(
        username=data['username'],
        email=data['email']
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    db.session.commit()
    
    return jsonify({'message': 'User registered successfully', 'user_id': user.id})

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    session['user_id'] = user.id
    
    return jsonify({
        'message': 'Login successful',
        'user_id': user.id,
        'username': user.username,
        'has_medical_profile': bool(user.height and user.weight and user.blood_type)
    })

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'message': 'Logout successful'})

@app.route('/profile', methods=['GET', 'POST'])
def profile():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    user = User.query.get(user_id)
    
    if request.method == 'GET':
        return jsonify({
            'username': user.username,
            'email': user.email,
            'height': user.height,
            'weight': user.weight,
            'blood_type': user.blood_type,
            'allergies': user.allergies,
            'medical_conditions': user.medical_conditions,
            'emergency_contact': user.emergency_contact,
            'preferred_language': user.preferred_language
        })
    
    elif request.method == 'POST':
        data = request.json
        
        user.height = data.get('height', user.height)
        user.weight = data.get('weight', user.weight)
        user.blood_type = data.get('blood_type', user.blood_type)
        user.allergies = data.get('allergies', user.allergies)
        user.medical_conditions = data.get('medical_conditions', user.medical_conditions)
        user.emergency_contact = data.get('emergency_contact', user.emergency_contact)
        user.preferred_language = data.get('preferred_language', user.preferred_language)
        
        db.session.commit()
        
        return jsonify({'message': 'Profile updated successfully'})

@app.route('/medications', methods=['GET', 'POST'])
def medications():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    
    if request.method == 'GET':
        user_medications = Medication.query.filter_by(user_id=user_id).all()
        
        result = []
        for med in user_medications:
            reminders = MedicationReminder.query.filter_by(medication_id=med.id).all()
            med_dict = {
                'id': med.id,
                'name': med.name,
                'dosage': med.dosage,
                'frequency': med.frequency,
                'time_of_day': med.time_of_day,
                'start_date': med.start_date.isoformat(),
                'end_date': med.end_date.isoformat() if med.end_date else None,
                'status': med.status,
                'notes': med.notes,
                'reminders': [
                    {
                        'id': r.id,
                        'scheduled_time': r.scheduled_time.isoformat(),
                        'is_sent': r.is_sent,
                        'is_acknowledged': r.is_acknowledged,
                        'status': r.status
                    } for r in reminders
                ]
            }
            result.append(med_dict)
        
        return jsonify(result)
    
    elif request.method == 'POST':
        data = request.json
        
        # Create new medication
        medication = Medication(
            user_id=user_id,
            name=data['name'],
            dosage=data['dosage'],
            frequency=data['frequency'],
            time_of_day=data['time_of_day'],
            start_date=datetime.fromisoformat(data['start_date']) if 'start_date' in data else datetime.utcnow(),
            end_date=datetime.fromisoformat(data['end_date']) if 'end_date' in data else None,
            notes=data.get('notes', '')
        )
        
        db.session.add(medication)
        db.session.commit()
        
        # Create reminders based on frequency
        if 'daily' in data['frequency'].lower():
            # Parse time of day
            times = data['time_of_day'].split(',')
            for time_str in times:
                time_str = time_str.strip()
                if not time_str:
                    continue
                
                # Parse time (format like "8:00 AM")
                try:
                    hour, minute = time_str.split(':')
                    hour = int(hour)
                    minute = int(minute.split()[0])
                    am_pm = time_str.split()[1].upper()
                    
                    if am_pm == 'PM' and hour < 12:
                        hour += 12
                    elif am_pm == 'AM' and hour == 12:
                        hour = 0
                    
                    # Create daily reminders for next 30 days
                    current_date = datetime.utcnow().date()
                    for i in range(30):
                        reminder_date = current_date + timedelta(days=i)
                        reminder_time = datetime.combine(reminder_date, datetime.min.time()) + timedelta(hours=hour, minutes=minute)
                        
                        reminder = MedicationReminder(
                            medication_id=medication.id,
                            scheduled_time=reminder_time
                        )
                        
                        db.session.add(reminder)
                except Exception as e:
                    print(f"Error parsing time: {e}")
        
        db.session.commit()
        
        return jsonify({
            'message': 'Medication added successfully',
            'medication_id': medication.id
        })

@app.route('/medications/<int:medication_id>', methods=['PUT', 'DELETE'])
def update_medication(medication_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    
    medication = Medication.query.filter_by(id=medication_id, user_id=user_id).first()
    
    if not medication:
        return jsonify({'error': 'Medication not found'}), 404
    
    if request.method == 'PUT':
        data = request.json
        
        medication.name = data.get('name', medication.name)
        medication.dosage = data.get('dosage', medication.dosage)
        medication.frequency = data.get('frequency', medication.frequency)
        medication.time_of_day = data.get('time_of_day', medication.time_of_day)
        medication.start_date = datetime.fromisoformat(data['start_date']) if 'start_date' in data else medication.start_date
        medication.end_date = datetime.fromisoformat(data['end_date']) if 'end_date' in data else medication.end_date
        medication.status = data.get('status', medication.status)
        medication.notes = data.get('notes', medication.notes)
        
        db.session.commit()
        
        return jsonify({'message': 'Medication updated successfully'})
    
    elif request.method == 'DELETE':
        # Delete all reminders first
        MedicationReminder.query.filter_by(medication_id=medication_id).delete()
        
        # Then delete the medication
        db.session.delete(medication)
        db.session.commit()
        
        return jsonify({'message': 'Medication deleted successfully'})

@app.route('/appointments', methods=['GET', 'POST'])
def appointments():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    
    if request.method == 'GET':
        user_appointments = Appointment.query.filter_by(user_id=user_id).all()
        
        result = []
        for appt in user_appointments:
            reminders = AppointmentReminder.query.filter_by(appointment_id=appt.id).all()
            appt_dict = {
                'id': appt.id,
                'doctor_name': appt.doctor_name,
                'specialty': appt.specialty,
                'location': appt.location,
                'date_time': appt.date_time.isoformat(),
                'purpose': appt.purpose,
                'notes': appt.notes,
                'status': appt.status,
                'reminders': [
                    {
                        'id': r.id,
                        'reminder_time': r.reminder_time.isoformat(),
                        'is_sent': r.is_sent
                    } for r in reminders
                ]
            }
            result.append(appt_dict)
        
        return jsonify(result)
    
    elif request.method == 'POST':
        data = request.json
        
        # Create new appointment
        appointment = Appointment(
            user_id=user_id,
            doctor_name=data['doctor_name'],
            specialty=data.get('specialty', ''),
            location=data['location'],
            date_time=datetime.fromisoformat(data['date_time']),
            purpose=data.get('purpose', ''),
            notes=data.get('notes', '')
        )
        
        db.session.add(appointment)
        db.session.commit()
        
        # Create reminders (1 day before, 1 hour before)
        reminder1 = AppointmentReminder(
            appointment_id=appointment.id,
            reminder_time=appointment.date_time - timedelta(days=1)
        )
        
        reminder2 = AppointmentReminder(
            appointment_id=appointment.id,
            reminder_time=appointment.date_time - timedelta(hours=1)
        )
        
        db.session.add(reminder1)
        db.session.add(reminder2)
        db.session.commit()
        
        return jsonify({
            'message': 'Appointment added successfully',
            'appointment_id': appointment.id
        })

@app.route('/timers', methods=['GET', 'POST'])
def timers():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    
    if request.method == 'GET':
        user_timers = Timer.query.filter_by(user_id=user_id).all()
        
        result = []
        for timer in user_timers:
            timer_dict = {
                'id': timer.id,
                'name': timer.name,
                'duration': timer.duration,
                'start_time': timer.start_time.isoformat() if timer.start_time else None,
                'end_time': timer.end_time.isoformat() if timer.end_time else None,
                'status': timer.status,
                'created_at': timer.created_at.isoformat()
            }
            result.append(timer_dict)
        
        return jsonify(result)
    
    elif request.method == 'POST':
        data = request.json
        
        # Create new timer
        timer = Timer(
            user_id=user_id,
            name=data['name'],
            duration=data['duration']  # Duration in seconds
        )
        
        db.session.add(timer)
        db.session.commit()
        
        return jsonify({
            'message': 'Timer created successfully',
            'timer_id': timer.id
        })

@app.route('/timers/<int:timer_id>/start', methods=['POST'])
def start_timer(timer_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    
    timer = Timer.query.filter_by(id=timer_id, user_id=user_id).first()
    
    if not timer:
        return jsonify({'error': 'Timer not found'}), 404
    
    current_time = datetime.utcnow()
    timer.start_time = current_time
    timer.end_time = current_time + timedelta(seconds=timer.duration)
    timer.status = 'Running'
    
    db.session.commit()
    
    return jsonify({
        'message': 'Timer started',
        'start_time': timer.start_time.isoformat(),
        'end_time': timer.end_time.isoformat()
    })

@app.route('/insights', methods=['GET'])
def insights():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    
    # Get unread insights first, then read insights, limit to 10 total
    unread_insights = HealthInsight.query.filter_by(user_id=user_id, is_read=False).order_by(HealthInsight.generated_at.desc()).all()
    read_insights = HealthInsight.query.filter_by(user_id=user_id, is_read=True).order_by(HealthInsight.generated_at.desc()).limit(10 - len(unread_insights)).all()
    
    all_insights = unread_insights + read_insights
    
    result = []
    for insight in all_insights:
        insight_dict = {
            'id': insight.id,
            'type': insight.insight_type,
            'content': insight.content,
            'generated_at': insight.generated_at.isoformat(),
            'is_read': insight.is_read
        }
        result.append(insight_dict)
    
    return jsonify(result)

@app.route('/insights/<int:insight_id>/read', methods=['POST'])
def mark_insight_read(insight_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    
    insight = HealthInsight.query.filter_by(id=insight_id, user_id=user_id).first()
    
    if not insight:
        return jsonify({'error': 'Insight not found'}), 404
    
    insight.is_read = True
    db.session.commit()
    
    return jsonify({'message': 'Insight marked as read'})

@app.route('/ai/chat', methods=['POST'])
def ai_chat():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    data = request.json
    
    message = data['message']
    response_text = generate_ai_response(message, user_id)
    
    return jsonify({
        'response': response_text
    })

@app.route('/ai/voice', methods=['POST'])
def ai_voice():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user_id = session['user_id']
    data = request.json
    
    user = User.query.get(user_id)
    
    message = data['message']
    response_text = generate_ai_response(message, user_id)
    
    # Convert response to speech
    language_code = user.preferred_language if user.preferred_language else 'en-US'
    audio_content = text_to_speech(response_text, language_code)
    
    return jsonify({
        'response': response_text,
        'audio': audio_content
    })

# SocketIO event handlers
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')

@socketio.on('join_user_channel')
def handle_join_user_channel(data):
    user_id = data.get('user_id')
    if user_id:
        print(f'User {user_id} joined their notification channel')

@socketio.on('medication_taken')
def handle_medication_taken(data):
    reminder_id = data.get('reminder_id')
    medication_id = data.get('medication_id')
    
    if reminder_id and medication_id:
        with app.app_context():
            reminder = MedicationReminder.query.get(reminder_id)
            medication = Medication.query.get(medication_id)
            
            if reminder and medication:
                reminder.is_acknowledged = True
                reminder.status = 'Acknowledged'
                medication.status = 'Taken'
                db.session.commit()
                
                return {'success': True, 'message': 'Medication marked as taken'}
    
    return {'success': False, 'message': 'Failed to update medication status'}

if __name__ == '__main__':
    socketio.run(app, debug=True)