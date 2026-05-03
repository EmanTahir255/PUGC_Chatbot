const Groq = require("groq-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const SUPPORTED_INTENTS = [
  "greet", "goodbye", "bot_introduction", "thank_you", "fallback_help", "ask_fee_deadline",
  "ask_tuition_fee", "ask_cs_fee", "ask_bba_fee", "ask_late_fee", "ask_fee_payment_method", "ask_scholarship",
  "ask_scholarship_deadline", "ask_fee_refund", "ask_hostel_fee", "ask_transport_fee", "ask_admission_requirements", "ask_admission_schedule",
  "ask_entry_test_details", "ask_merit_list", "ask_documents_list", "ask_transfer_policy", "ask_foreign_student_admission", "ask_available_programs",
  "ask_bs_cs_details", "ask_bba_details", "ask_program_duration", "ask_credit_hours", "ask_elective_courses", "ask_phd_program",
  "ask_ms_program", "ask_course_change", "ask_exam_schedule", "ask_result_date", "ask_grading_system", "ask_attendance_policy",
  "ask_exam_rules", "ask_recheck_result", "ask_backlog_exam", "ask_library_hours", "ask_library_membership", "ask_library_books",
  "ask_library_fine", "ask_digital_library", "ask_hostel_availability", "ask_hostel_application", "ask_hostel_rules", "ask_hostel_facilities",
  "ask_department_list", "ask_cs_department", "ask_bba_department", "ask_hod_contact", "ask_dean_contact", "ask_vc_contact",
  "ask_dress_code", "ask_mobile_phone_policy", "ask_ragging_policy", "ask_smoking_policy", "ask_code_of_conduct", "ask_plagiarism_policy",
  "ask_student_id_card", "ask_semester_start", "ask_semester_end", "ask_holidays", "ask_winter_break", "ask_summer_break",
  "ask_add_drop", "ask_semester_events", "ask_orientation", "ask_wifi", "ask_cafeteria", "ask_computer_lab",
  "ask_sports_facilities", "ask_transport", "ask_transport_routes", "ask_parking", "ask_health_center", "ask_prayer_area",
  "ask_atm", "ask_photocopying", "ask_main_contact", "ask_university_address", "ask_student_portal", "ask_transcript",
  "ask_degree_certificate", "ask_character_certificate", "ask_migration_certificate", "ask_enrollment_status", "ask_registration", "ask_dropout_policy",
  "ask_student_societies", "ask_sports_teams", "ask_internship", "ask_alumni_network", "ask_counseling", "ask_research_facilities",
  "ask_final_year_project", "ask_thesis", "ask_quota_system", "ask_matric_certificate", "ask_intermediate_certificate", "ask_cnic_requirement",
  "ask_domicile_requirement", "ask_photos_requirement", "ask_bs_math_details", "ask_bs_english_details", "ask_course_prerequisites", "ask_course_instructor",
  "ask_recommended_books", "ask_course_assessment", "ask_graduation_requirements", "ask_cgpa_requirement", "ask_academic_calendar", "ask_spring_semester_dates",
  "ask_fall_semester_dates", "ask_summer_semester", "ask_class_timetable", "ask_class_timings", "ask_section_change", "ask_exam_system",
  "ask_seating_plan", "ask_provisional_certificate", "ask_attendance_shortage", "ask_medical_leave", "ask_leave_application", "ask_grade_improvement",
  "ask_academic_probation", "ask_distinction", "ask_registration_deadline", "ask_late_registration", "ask_withdrawal_policy", "ask_study_plan",
  "ask_internship_report", "ask_fyp_supervisor", "ask_fyp_topic", "ask_fyp_evaluation", "ask_thesis_format", "ask_convocation",
  "ask_graduation_eligibility", "ask_migration_policy", "ask_noc_process", "ask_scholarship_renewal", "ask_scholarship_cancellation", "ask_student_loan",
  "ask_installment_plan", "ask_document_verification", "ask_library_general", "ask_library_location", "ask_library_catalog", "ask_library_reservation",
  "ask_reading_room", "ask_hostel_warden", "ask_gym_facility", "ask_lab_software", "ask_lab_booking", "ask_wifi_problems",
  "ask_campus_security", "ask_lost_found", "ask_building_locations", "ask_public_transport", "ask_career_services", "ask_job_placement",
  "ask_cv_building", "ask_interview_preparation", "ask_cs_society", "ask_event_registration", "ask_event_eligibility", "ask_exchange_program",
  "ask_industry_partnerships", "ask_entrepreneurship", "ask_complaint_system", "ask_admissions_contact", "ask_exam_office_contact", "ask_accounts_contact",
  "ask_it_support_contact", "ask_emergency_contacts", "ask_department_events", "ask_department_office_hours", "ask_online_resources", "ask_id_card_replacement",
  "ask_no_dues_certificate"
];

const SUPPORTED_INTENT_SET = new Set(SUPPORTED_INTENTS);

function historyToTranscript(conversationHistory = []) {
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return "";
  }

  return conversationHistory
    .map(item => {
      const role = item.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${item.content}`;
    })
    .join("\n");
}

async function runGroqChat(messages, maxTokens, temperature, requireJson = false) {
  const params = {
    model: GROQ_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature
  };

  if (requireJson) {
      params.response_format = { type: "json_object" };
  }

  const completion = await groq.chat.completions.create(params);

  return completion.choices?.[0]?.message?.content?.trim() || null;
}

async function runGeminiChat(messages, maxTokens, temperature, requireJson = false) {
  if (!geminiClient) {
    return null;
  }

  const model = geminiClient.getGenerativeModel({ model: GEMINI_MODEL });
  const systemPrompt = messages
    .filter(message => message.role === "system")
    .map(message => message.content)
    .join("\n\n");
  const transcript = messages
    .filter(message => message.role !== "system")
    .map(message => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");

  const prompt = `${systemPrompt}\n\nConversation:\n${transcript}\n\nReply exactly as instructed above.`;
  
  const generationConfig = {
      temperature,
      maxOutputTokens: maxTokens
  };

  if (requireJson) {
      generationConfig.responseMimeType = "application/json";
  }

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig
  });

  return result.response?.text()?.trim() || null;
}

async function runChatWithFallback(messages, maxTokens, temperature, errorLabel, requireJson = false) {
  try {
    return await runGroqChat(messages, maxTokens, temperature, requireJson);
  } catch (error) {
    console.error(`${errorLabel} (Groq):`, error.message);

    if (!geminiClient) {
      return null;
    }

    try {
      console.log(`${errorLabel}: trying Gemini fallback...`);
      return await runGeminiChat(messages, maxTokens, temperature, requireJson);
    } catch (geminiError) {
      console.error(`${errorLabel} (Gemini):`, geminiError.message);
      return null;
    }
  }
}

// Extract intent keyword from question using Groq
async function extractIntentFromQuestion(userMessage) {
  try {
    const result = await runChatWithFallback(
      [
        {
          role: "system",
          content: `You are an intent classifier for PUGC university chatbot. 
Given a student question, return ONLY a single database intent name from this list (return exactly as written, nothing else):

${SUPPORTED_INTENTS.join(", ")}

If the question does not match any intent, return: NONE`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      50,
      0.1,
      "Intent extraction error"
    );

    if (!result) return null;
    return result === "NONE" || !SUPPORTED_INTENT_SET.has(result) ? null : result;
  } catch (error) {
    console.error("Intent extraction error:", error.message);
    return null;
  }
}

function parseLLMResponse(jsonString) {
    if (!jsonString) return null;
    try {
        const parsed = JSON.parse(jsonString);
        return {
            cleanText: parsed.reply || "<b>Response format error</b>",
            isUnanswered: !!parsed.unanswered
        };
    } catch (e) {
        console.error("Failed to parse JSON response:", e.message, "\\nRaw Output:", jsonString);
        return {
            cleanText: jsonString,
            isUnanswered: false
        };
    }
}

// General AI response when DB has no answer
async function getGroqResponse(userMessage, conversationHistory = []) {
    try {
        const messages = [
            {
                role: 'system',
                content: `You are PUGC SmartBot, a helpful virtual assistant for Punjab University Gujranwala Campus (PUGC) in Pakistan.

Rules:
- Only answer questions related to PUGC, university life, academics, admissions, fees, hostel, library, departments, exams, scholarships, and student services
- If unrelated to university, say you can only help with PUGC related queries
- Keep answers concise and helpful
- Formal but friendly tone
- If unsure about specific PUGC details, give general guidance and suggest contacting PUGC at 055-9200001
- Use conversation history to understand follow-up questions and references like "its fee", "tell me more", "what about that"

IMPORTANT JSON FORMAT:
You MUST respond with a valid JSON object exactly matching this structure:
{
  "reply": "Your markdown formatted string here",
  "unanswered": boolean
}
Set "unanswered": true ONLY if you do not have a specific and complete answer and must suggest contacting PUGC or give general guidance. Otherwise false.

Your "reply" string MUST follow these rules:
- Always start with a bold heading using <b>heading</b>
- Do not return one long paragraph
- Use <br><br> after the heading
- Use <ul><li><b>Label:</b> value</li></ul> when the answer has multiple facts, fees, rules, steps, or requirements
- Use <b>text</b> for important values like numbers, fees, dates
- Never use markdown symbols like ** or ## or * for bullets
- Keep the final answer easy to scan, usually 3 to 7 bullet points
- Always end with contact info if relevant`
            },
            ...conversationHistory,
            {
                role: 'user',
                content: userMessage
            }
        ];
        const rawResponse = await runChatWithFallback(messages, 600, 0.7, 'General AI response error', true);
        return parseLLMResponse(rawResponse);

    } catch (error) {
        console.error('Groq error:', error.message);
        return null;
    }
}

async function isAnswerRelevant(userMessage, dbAnswer, conversationHistory = []) {
    try {
        // Gate broad DB answers so follow-up questions can be answered more precisely.
        const result = await runChatWithFallback(
            [
                {
                    role: 'system',
                    content: `Decide whether the candidate answer directly answers the user's latest question.
Use the conversation history only to understand references like "this", "them", "it", or "that".
Return ONLY YES or NO.`
                },
                ...conversationHistory,
                {
                    role: 'user',
                    content: `Latest user question:
${userMessage}

Candidate answer:
${dbAnswer}`
                }
            ],
            5,
            0,
            'Answer relevance error'
        );

        if (!result) return true;
        const normalized = result.trim().toUpperCase();
        if (normalized.includes('YES')) return true;
        if (normalized.includes('NO')) return false;
        return result === 'YES';
    } catch (error) {
        console.error('Answer relevance error:', error.message);
        return true;
    }
}

async function refineAnswerWithDBContext(userMessage, dbAnswer, conversationHistory = []) {
    try {
        // Reword only when the stored answer is related but does not directly answer the latest question.
        const rawResponse = await runChatWithFallback(
            [
                {
                    role: 'system',
                    content: `You are PUGC SmartBot, a helpful virtual assistant for Punjab University Gujranwala Campus (PUGC).
Answer the user's latest question directly and concisely.
Use the provided PUGC database information as trusted context, but do not repeat unrelated details.
If the database context does not contain the exact answer, infer only what is reasonable from it and say to contact PUGC for confirmation.

IMPORTANT JSON FORMAT:
You MUST respond with a valid JSON object exactly matching this structure:
{
  "reply": "Your markdown formatted string here",
  "unanswered": boolean
}
Set "unanswered": true ONLY if the specific data is missing from the context and you must suggest contacting PUGC. Otherwise false.

Your "reply" string MUST follow these rules:
- Always start with a bold heading using <b>heading</b>
- Do not return one long paragraph
- Use <br><br> after the heading
- Use <ul><li>item</li></ul> for lists only when useful
- Use <ul><li><b>Label:</b> value</li></ul> when the answer has multiple facts, fees, rules, steps, or requirements
- Use <b>text</b> for important values like numbers, fees, dates
- Never use markdown symbols like ** or ## or * for bullets
- Keep the final answer easy to scan, usually 3 to 7 bullet points`
                },
                ...conversationHistory,
                {
                    role: 'user',
                    content: `Latest user question:
${userMessage}

Related PUGC database information:
${dbAnswer}`
                }
            ],
            450,
            0.2,
            'Answer refinement error',
            true
        );
        return parseLLMResponse(rawResponse);
    } catch (error) {
        console.error('Answer refinement error:', error.message);
        return null;
    }
}

async function getGroundedGroqResponse(userMessage, dbAnswer, conversationHistory = []) {
    try {
        // Strict fallback: use nearby DB context, but do not invent missing PUGC facts.
        const rawResponse = await runChatWithFallback(
            [
                {
                    role: 'system',
                    content: `You are PUGC SmartBot.
Answer the user's latest question using ONLY the provided PUGC database information and the conversation history.
Do not introduce new departments, programs, fees, dates, or policies unless they appear in the provided information.
If the exact answer is not present, clearly say that it is not available in the current PUGC data and suggest contacting PUGC.

IMPORTANT JSON FORMAT:
You MUST respond with a valid JSON object exactly matching this structure:
{
  "reply": "Your markdown formatted string here",
  "unanswered": boolean
}
Set "unanswered": true ONLY if you cannot answer the question completely and must suggest contacting PUGC due to missing data. Otherwise false.

Your "reply" string MUST follow these rules:
- Always start with a bold heading using <b>heading</b>
- Do not return one long paragraph
- Use <br><br> after the heading
- Use <ul><li>item</li></ul> for lists only when useful
- Use <ul><li><b>Label:</b> value</li></ul> when the answer has multiple facts, fees, rules, steps, or requirements
- Never use markdown symbols like ** or ## or * for bullets
- Keep the final answer easy to scan, usually 3 to 7 bullet points`
                },
                ...conversationHistory,
                {
                    role: 'user',
                    content: `Latest user question:
${userMessage}

Nearest PUGC database information:
${dbAnswer}`
                }
            ],
            450,
            0.1,
            'Grounded Groq error',
            true
        );
        return parseLLMResponse(rawResponse);
    } catch (error) {
        console.error('Grounded Groq error:', error.message);
        return null;
    }
}

module.exports = {
    extractIntentFromQuestion,
    getGroqResponse,
    isAnswerRelevant,
    refineAnswerWithDBContext,
    getGroundedGroqResponse
};
