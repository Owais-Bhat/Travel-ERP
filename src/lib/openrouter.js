import { OPENROUTER_API_KEY } from '../config';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const callAI = async (messages, options = {}) => {
  const {
    model = 'openai/gpt-4-turbo-preview',
    temperature = 0.7,
    maxTokens = 2000,
    systemPrompt = '',
  } = options;

  const finalMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'AI API error');
    }

    const data = await response.json();
    return {
      success: true,
      data: data.choices[0].message.content,
      usage: data.usage,
    };
  } catch (error) {
    console.error('AI API Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Specialized AI functions

// 1. Admission Counselor Chatbot
export const admissionChatbot = async (userMessage, context = {}) => {
  const systemPrompt = `You are CyberMilo's AI Admission Counselor. You help prospective students and parents with:
- Admission process information
- Course recommendations
- Fee structure and scholarships
- Entrance test guidance
- Campus facilities and campus life
- Career paths after graduation
Be friendly, informative, and encouraging. Always offer next steps.`;

  const messages = [
    { role: 'user', content: userMessage },
  ];

  return await callAI(messages, { systemPrompt, model: 'openai/gpt-3.5-turbo' });
};

// 2. AI Lesson Plan Generator
export const generateLessonPlan = async (subject, chapter, gradeLevel, duration) => {
  const prompt = `Create a detailed lesson plan for:
Subject: ${subject}
Chapter: ${chapter}
Grade Level: ${gradeLevel}
Duration: ${duration} minutes

Include:
1. Learning Objectives
2. Introduction/Hook
3. Main Content with examples
4. Interactive Activity
5. Assessment method
6. Homework/Extension
7. Resources needed`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 2000 });
};

// 3. AI Question Paper Generator
export const generateQuestionPaper = async (subject, chapter, totalMarks, difficulty) => {
  const prompt = `Generate a question paper for:
Subject: ${subject}
Chapter: ${chapter}
Total Marks: ${totalMarks}
Difficulty Level: ${difficulty}

Include:
1. Multiple Choice Questions (4 options)
2. Short Answer Questions
3. Long Answer Questions
4. Solution key with marking scheme

Format as structured JSON.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 3000 });
};

// 4. AI Student Risk Detection
export const analyzeStudentRisk = async (studentData) => {
  const prompt = `Analyze this student's profile for risk factors:

Attendance: ${studentData.attendance}%
Marks Average: ${studentData.marksAverage}%
Fee Status: ${studentData.feeStatus}
Behavior Issues: ${studentData.behaviorIssues}
Parental Engagement: ${studentData.parentalEngagement}
Previous Performance: ${studentData.previousPerformance}

Identify:
1. Risk Level (Low/Medium/High)
2. Key Risk Factors
3. Recommended Interventions
4. Mentor/Counselor Assignment
5. Follow-up Schedule

Provide actionable insights in JSON format.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 2000 });
};

// 5. AI Fee Recovery Assistant
export const feeRecoveryAssistant = async (parentData, fees) => {
  const prompt = `Create a personalized fee recovery strategy for:

Parent: ${parentData.name}
Outstanding Amount: ₹${fees.outstanding}
Previous Payment History: ${parentData.paymentHistory}
Annual Income: ${parentData.income}
Reason for Delay: ${parentData.delayReason}

Suggest:
1. Risk Assessment (High/Medium/Low)
2. Best Contact Time
3. Recommended Approach (call/email/SMS)
4. Suggested Payment Plan
5. Incentive/Discount Recommendation
6. Escalation Timeline

Provide JSON formatted recommendations.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 1500 });
};

// 6. AI Timetable Generator
export const generateTimetable = async (timetableData) => {
  const prompt = `Generate an optimized school timetable with these constraints:

Classes: ${timetableData.classes}
Teachers: ${timetableData.teachers}
Subjects Per Class: ${JSON.stringify(timetableData.subjects)}
Working Days: ${timetableData.workingDays}
Periods Per Day: ${timetableData.periodsPerDay}
Period Duration: ${timetableData.periodDuration} minutes

Requirements:
1. No teacher conflicts
2. No back-to-back lab subjects
3. Difficult subjects in morning slots
4. PE/Sports in afternoon
5. Balanced teacher workload
6. Lab sessions on specific days only

Return as structured JSON with day-wise schedule.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 3000 });
};

// 7. AI Career Path Recommendation
export const recommendCareerPath = async (studentProfile) => {
  const prompt = `Recommend a career path based on this student profile:

Strengths: ${studentProfile.strengths.join(', ')}
Weaknesses: ${studentProfile.weaknesses.join(', ')}
Interests: ${studentProfile.interests.join(', ')}
Aptitude Scores: ${JSON.stringify(studentProfile.aptitudeScores)}
Academic Performance: ${studentProfile.academicPerformance}
Personality Type: ${studentProfile.personalityType}

Provide:
1. Recommended Streams (Science/Commerce/Arts)
2. Top 5 Career Paths
3. Colleges to Target
4. Entrance Exams to Prepare For
5. Skill Development Plan
6. Mentorship Recommendations

Format as actionable JSON.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 2000 });
};

// 8. AI Parent Meeting Summary
export const generateMeetingSummary = async (meetingNotes, student) => {
  const prompt = `Generate a professional parent-teacher meeting summary:

Student: ${student.name}
Class: ${student.class}
Meeting Notes: ${meetingNotes}

Create a structured summary with:
1. Student's Academic Performance
2. Strengths Identified
3. Areas for Improvement
4. Behavioral Observations
5. Action Items (with owner and deadline)
6. Recommended Interventions
7. Parent Responsibilities
8. Next Follow-up Date

Format for email delivery.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 1500 });
};

// 9. AI Complaint Classifier
export const classifyComplaint = async (complaintText) => {
  const prompt = `Classify this complaint and suggest action:

Complaint: ${complaintText}

Identify:
1. Category (academic/transport/fee/bullying/safety/teacher/facilities)
2. Priority (urgent/high/medium/low)
3. Affected Department
4. Recommended Owner
5. Suggested Resolution Steps
6. Escalation Path if needed

Return as structured JSON.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 1000 });
};

// 10. AI Performance Analysis
export const analyzePerformance = async (studentResults) => {
  const prompt = `Analyze student exam performance and provide insights:

Subject Results: ${JSON.stringify(studentResults)}

Provide:
1. Strong Subjects
2. Weak Subjects
3. Topic-wise Weakness Analysis
4. Improvement Trajectory
5. Recommended Remedial Topics
6. Study Strategy Suggestions
7. Predicted Board Exam Score
8. Comparison with Class Average

Format as detailed JSON.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 2000 });
};

// 11. AI Exam Result Summary
export const summarizeExamResults = async (examData) => {
  const prompt = `Write a short, plain-language summary of this exam's results for a school administrator.

Exam: ${examData.title} (${examData.subject}, ${examData.class_name})
Total Marks: ${examData.totalMarks} | Pass Marks: ${examData.passMarks}
Students Appeared: ${examData.total}
Pass Rate: ${examData.passPercent}%
Class Average: ${examData.avg}
Highest Score: ${examData.highest}
Grade Distribution: ${JSON.stringify(examData.gradeDistribution)}

Cover in plain conversational text (no JSON, no markdown headers):
1. Overall how the class performed
2. Whether the pass rate and average are healthy for this exam
3. Any notable spread between highest score and average
4. 2-3 concrete, actionable recommendations for the teacher

Keep it under 200 words.`;

  const messages = [{ role: 'user', content: prompt }];
  return await callAI(messages, { maxTokens: 500 });
};

export default {
  callAI,
  admissionChatbot,
  generateLessonPlan,
  generateQuestionPaper,
  analyzeStudentRisk,
  feeRecoveryAssistant,
  generateTimetable,
  recommendCareerPath,
  generateMeetingSummary,
  classifyComplaint,
  analyzePerformance,
  summarizeExamResults,
};
