import { ActivityTypes } from '../utils.js';

async function executeMail(activityType) {
  try {
    const email = "unicefadttest@gmail.com"; //ADD EMAIL
    const iconElements = document.querySelectorAll(".fa-pen-to-square");

    const urlPage = window.location.href

    iconElements.forEach((iconElement, index) => {
      if (iconElement.classList.contains("fa-pen-to-square") &&
        iconElement.classList.contains("text-blue-700") &&
        iconElement.classList.contains("mr-2")) {

        const parentElement = iconElement.parentElement;

        if (parentElement) {
          const spanElement = parentElement.querySelector("span");

          if (spanElement) {
            const answerText = spanElement.innerText.trim();

            let answers = JSON.parse(localStorage.getItem("instructionPage"));

            if (!Array.isArray(answers)) {
              answers = [];
            }

            const exists = answers.some(activity => activity.text === answerText);

            if (!exists) {
              answers.push({ number: answers.length + 1, text: answerText });
              localStorage.setItem("instructionPage", JSON.stringify(answers));
            }
          }
        }
      }
    });
    const activityId = location.pathname.split("/").pop().split(".")[0];
    const pageParts = activityId.replace(/_/g, ".").split(".").slice(0, 2);
    const firstNumber = parseInt(pageParts[0], 10);
    const secondNumber = parseInt(pageParts[1], 10);
    const adjustedFirstNumber = firstNumber === 0 ? 0 : firstNumber - 1;
    const adjustedSecondNumber = secondNumber + 1;
    const pageNumber = `${adjustedFirstNumber}.${adjustedSecondNumber}`;
    const namePage = localStorage.getItem("namePage");
    const instructionPage = JSON.parse(localStorage.getItem("instructionPage")) || [];
    const intentCount = localStorage.getItem(activityId + "-intentos");


    const filteredStorageData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(activityId) && !key.includes("-intentos") && !key.includes("_succes")) {
        filteredStorageData[key] = localStorage.getItem(key);
      }
    }
    const instructionPageHtml = instructionPage.length > 0
      ? instructionPage.map(activity =>
        `<h3><strong>Instrucción ${activity.number}</strong>: ${activity.text}</h3>`
      ).join("")
      : "<p>No hay instrucciones en esta pagina</p>";

    const completedActivities = JSON.parse(localStorage.getItem("completedActivities") || "[]");
    const activitiesWithDetails = completedActivities.map(activity => {

      const parts = activity.replace(/_/g, ".").split(".").slice(0, 2);
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      const adjustedFirst = first === 0 ? 0 : first - 1;
      const adjustedSecond = second + 1;
      const pageNum = `${adjustedFirst}.${adjustedSecond}`;
      const sortValue = adjustedFirst * 100 + adjustedSecond;
      const match = activity.match(/^[^\-]+-([^-\d]+)-(\d+)-(.+)$/);

      let nameActivity = '';
      let intent = '';
      let time = '';

      if (match) {
        nameActivity = match[1].trim();
        intent = match[2];
        time = match[3].trim();
      }

      return {
        id: activity,
        pageNumber: pageNum,
        name: nameActivity,
        sortValue: sortValue,
        intent: intent,
        time: time
      };
    });


    // Sort activities by numeric value
    activitiesWithDetails.sort((a, b) => a.sortValue - b.sortValue);

    // Generate HTML for sorted activities
    const completedActivitiesHtml = completedActivities.length > 0
      ? `<ul>${activitiesWithDetails.map(activity =>
        `
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr>
              <th style="padding: 8px; border: 1px solid #ddd;"> <strong>Página ${activity.pageNumber}</strong>: ${activity.name} </th>
              <th style="padding: 8px; border: 1px solid #ddd;">Intentos: ${activity.intent}</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Time Completed: ${activity.time}</th>
          </table>`

      ).join("")}</ul>`
      : "<p>No hay actividades completadas aún.</p>";

    // Get the character information from localStorage
    let idUser = localStorage.getItem("nameUser");
    let characterEmoji = "";
    let studentID = localStorage.getItem("studentID") || "unknown-student";

    // Try to get the character emoji from localStorage
    const characterInfo = localStorage.getItem("characterInfo");
    if (characterInfo) {
      try {
        const characterData = JSON.parse(characterInfo);
        characterEmoji = characterData.emoji || "";
      } catch (e) {
        console.error("Error parsing character information:", e);
      }
    }

    // If nameUser is not set (unlikely as it's set on index page), use the backup generator
    if (!idUser) {
      const adjetivos = ["Rápido", "Feroz", "Dulce", "Elegante", "Intrépido"];
      const animales = ["Tigre", "Águila", "Lobo", "Jaguar", "Puma"];
      function generarNombre() {
        const adj = adjetivos[Math.floor(Math.random() * adjetivos.length)];
        const ani = animales[Math.floor(Math.random() * animales.length)];
        return `${ani} ${adj}`;
      }

      idUser = generarNombre();
      localStorage.setItem("nameUser", idUser);
    }

    let htmlContent = "";

    switch (activityType) {
      case ActivityTypes.MULTIPLE_CHOICE:
      case ActivityTypes.QUIZ: {
        const activityLabel = activityType === ActivityTypes.QUIZ ? 'Quiz interactivo' : 'Opción múltiple';
        htmlContent = `
          <h2 style="color: #4CAF50; text-align: center;">Respuesta del alumno ${characterEmoji} ${idUser}</h2>
          <h3 style="text-align: center;">Actividad: <a href="${urlPage}">${namePage}</a></h3>
          <h3 style="color: #333;">${instructionPageHtml} </h3>
          <h3 style="color: #333;">Página: ${pageNumber} </h3>
          <h4>Tipo: ${activityLabel}</h4>
          <h4 style="color: #555;">Intentos: ${intentCount}</h4>


         <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background-color: #4CAF50; color: white;">
              <th style="padding: 8px; border: 1px solid #ddd;">Estado</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Completado ✅</th>
          </table>

          <h3 style="color: #333; margin-top: 15px;">📌 Actividades completadas:</h3>
          <div style="background-color: #e9f7e5; padding: 10px; border-radius: 5px;">
            ${completedActivitiesHtml}
          </div>
        `;
        break;
      }

      case ActivityTypes.FILL_IN_THE_BLANK:
        htmlContent = `
          <h2 style="color: #4CAF50; text-align: center;">Respuesta del alumno ${characterEmoji} ${idUser}</h2>
          <h3 style="text-align: center;">Actividad: <a href="${urlPage}">${namePage}</a></h3>
          <h3 style="color: #333;">${instructionPageHtml} </h3>
          <h3 style="color: #333;">Página: ${pageNumber} </h3>
          <h4>Tipo: Completar espacios en blanco</h4>
          <h4 style="color: #555;">Intentos: ${intentCount}</h4>

           <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background-color: #4CAF50; color: white;">
              <th style="padding: 8px; border: 1px solid #ddd;">Estado</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Completado ✅</th>
          </table>

          <h3 style="color: #333; margin-top: 15px;">📌 Actividades completadas:</h3>
          <div style="background-color: #e9f7e5; padding: 10px; border-radius: 5px;">
            ${completedActivitiesHtml}
          </div>
        `;
        break;

      case ActivityTypes.OPEN_ENDED_ANSWER:
        htmlContent = `
          <h2 style="color: #4CAF50; text-align: center;">Respuesta del alumno ${characterEmoji} ${idUser}</h2>
          <h3 style="text-align: center;">Actividad: <a href="${urlPage}">${namePage}</a></h3>
          <h3 style="color: #333;">${instructionPageHtml} </h3>
          <h3 style="color: #333;">Página: ${pageNumber} </h3>
          <h4>Tipo: Respuesta abierta</h4>
          <h4 style="color: #555;">Intentos: ${intentCount}</h4>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background-color: #4CAF50; color: white;">
              <th style="padding: 8px; border: 1px solid #ddd;">Pregunta</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Respuesta</th>
              ${Object.entries(filteredStorageData)
            .map(([key, value]) => [key.slice(-1), value])
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([lastChar, value], index) => `<tr><td>${index}</td><td>${value}</td></tr>`)
            .join("")}
            </table>
         
           <h3 style="color: #333; margin-top: 15px;">📌 Actividades completadas:</h3>
          <div style="background-color: #e9f7e5; padding: 10px; border-radius: 5px;">
            ${completedActivitiesHtml}
          </div>
        `;
        break;

      case ActivityTypes.SORTING:
        htmlContent = `
          <h2 style="color: #4CAF50; text-align: center;">Respuesta del alumno ${characterEmoji} ${idUser}</h2>
          <h3 style="text-align: center;">Actividad: <a href="${urlPage}">${namePage}</a></h3>
          <h3 style="color: #333;">${instructionPageHtml} </h3>
          <h3 style="color: #333;">Página: ${pageNumber} </h3>
          <h4 style="color: #555;">Tipo: Ordenar elementos</h4>
          <h4 style="color: #555;">Intentos: ${intentCount}</h4>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background-color: #4CAF50; color: white;">
              <th style="padding: 8px; border: 1px solid #ddd;">Estado</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Completado ✅</th>
          </table>

          <h3 style="color: #333; margin-top: 15px;">📌 Actividades completadas:</h3>
          <div style="background-color: #e9f7e5; padding: 10px; border-radius: 5px;">
            ${completedActivitiesHtml}
          </div>
        `;
        break;

      case ActivityTypes.MATCHING:
        htmlContent = `
          <h2 style="color: #4CAF50; text-align: center;">Respuesta del alumno ${characterEmoji} ${idUser}</h2>
          <h3 style="text-align: center;">Actividad: <a href="${urlPage}">${namePage}</a></h3>
          <h3 style="color: #333;">${instructionPageHtml} </h3>
          <h3>Página: ${pageNumber}</h3>
          <h4>Tipo: Relacionar columnas</h4>
          <h4 style="color: #555;">Intentos: ${intentCount}</h4>


         <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background-color: #4CAF50; color: white;">
              <th style="padding: 8px; border: 1px solid #ddd;">Estado</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Completado ✅</th>
          </table>

          <h3 style="color: #333; margin-top: 15px;">📌 Actividades completadas:</h3>
          <div style="background-color: #e9f7e5; padding: 10px; border-radius: 5px;">
            ${completedActivitiesHtml}
          </div>
        `;
        break;

      case ActivityTypes.TRUE_FALSE:
        htmlContent = `
          <h2 style="color: #4CAF50; text-align: center;">Respuesta del alumno ${characterEmoji} ${idUser}</h2>
          <h3 style="text-align: center;">Actividad: <a href="${urlPage}">${namePage}</a></h3>
          <h3 style="color: #333;">${instructionPageHtml} </h3>
          <h3>Página: ${pageNumber}</h3>
          <h4>Tipo: Verdadero o falso</h4>
          <h4 style="color: #555;">Intentos: ${intentCount}</h4>


           <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background-color: #4CAF50; color: white;">
              <th style="padding: 8px; border: 1px solid #ddd;">Estado</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Completado ✅</th>
          </table>

          <h3 style="color: #333; margin-top: 15px;">📌 Actividades completadas:</h3>
          <div style="background-color: #e9f7e5; padding: 10px; border-radius: 5px;">
            ${completedActivitiesHtml}
          </div>
        `;
        break;

      case ActivityTypes.FILL_IN_A_TABLE:
        htmlContent = `
          <h2 style="color: #4CAF50; text-align: center;">Respuesta del alumno ${characterEmoji} ${idUser}</h2>
          <h3 style="text-align: center;">Actividad: <a href="${urlPage}">${namePage}</a></h3>
          <h3 style="color: #333;">${instructionPageHtml} </h3>
          <h3>Página: ${pageNumber}</h3>
          <h4>Tipo: Completar tabla</h4>
          <h4 style="color: #555;">Intentos: ${intentCount}</h4>


          <table style="width: 100%; border-collapse: collapse; border: 1px solid #ddd;">
            <tr style="background-color: #4CAF50; color: white;">
              <th style="padding: 8px; border: 1px solid #ddd;">Pregunta</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Respuesta</th>
              ${Object.entries(filteredStorageData)
            .map(([key, value]) => [key.slice(-1), value])
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([lastChar, value], index) => `<tr><td>${index}</td><td>${value}</td></tr>`)
            .join("")}
            </table>
         
          <h3 style="color: #333; margin-top: 15px;">📌 Actividades completadas:</h3>
          <div style="background-color: #e9f7e5; padding: 10px; border-radius: 5px;">
            ${completedActivitiesHtml}
          </div>
        `;
        break;

      default:
        alert("❌ Tipo de actividad no reconocido.");
        return;
    }

    const API_KEY = "";

    const payload = {
      sender: { name: idUser, email: "testmailadtunicef@gmail.com" },
      to: [{ email: email }],
      subject: `Respuesta de estudiante [ID: ${studentID}]`,
      htmlContent: htmlContent,
    };

    /*const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error al enviar el correo: ${response.status} - ${errorText}`);
    }*/

  } catch (error) {
    console.error("❌ Error en el envío del correo:", error);
  }
  localStorage.removeItem("instructionPage")
}

export { executeMail };