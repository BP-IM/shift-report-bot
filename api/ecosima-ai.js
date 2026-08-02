const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

const ALLOWED_MODELS = new Set([
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image"
]);

const ALLOWED_ASPECT_RATIOS = new Set([
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9"
]);

const ALLOWED_IMAGE_SIZES = new Set([
  "0.5K",
  "1K",
  "2K",
  "4K"
]);

function sendJson(res, status, payload) {
  res.statusCode = status;

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.end(JSON.stringify(payload));
}

function getBearerToken(req) {
  const header = String(
    req.headers.authorization || ""
  );

  return header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";
}

async function verifySupabaseSession(token) {
  const supabaseUrl =
    process.env.SUPABASE_URL;

  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "На Vercel не настроены SUPABASE_URL и SUPABASE_ANON_KEY."
    );
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.ok;
}

function normalizeImages(images) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .slice(0, 4)
    .map((image, index) => {
      const mimeType = String(
        image?.mime_type || ""
      );

      const data = String(
        image?.data || ""
      );

      if (!mimeType.startsWith("image/")) {
        throw new Error(
          `Вложение ${index + 1} не является изображением.`
        );
      }

      if (
        !data ||
        data.length > 1_050_000
      ) {
        throw new Error(
          `Вложение ${index + 1} слишком большое. Уменьшите изображение.`
        );
      }

      return {
        type: "image",
        mime_type: mimeType,
        data
      };
    });
}

function collectOutput(response) {
  let image = null;

  const textParts = [];

  if (response?.output_image?.data) {
    image = {
      data: response.output_image.data,

      mimeType:
        response.output_image.mime_type ||
        "image/jpeg"
    };
  }

  for (
    const step of response?.steps || []
  ) {
    if (step?.type !== "model_output") {
      continue;
    }

    for (
      const block of step?.content || []
    ) {
      if (
        block?.type === "image" &&
        block?.data &&
        !image
      ) {
        image = {
          data: block.data,

          mimeType:
            block.mime_type ||
            "image/jpeg"
        };
      }

      if (
        block?.type === "text" &&
        block?.text
      ) {
        textParts.push(block.text);
      }
    }
  }

  return {
    interactionId:
      response?.id ||
      response?.interaction_id ||
      null,

    image,

    text: textParts
      .join("\n")
      .trim()
  };
}

module.exports = async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return sendJson(
      res,
      405,
      {
        error:
          "Разрешён только POST-запрос."
      }
    );
  }

  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return sendJson(
      res,
      500,
      {
        error:
          "На Vercel не настроена переменная GEMINI_API_KEY."
      }
    );
  }

  try {
    const token =
      getBearerToken(req);

    if (!token) {
      return sendJson(
        res,
        401,
        {
          error:
            "Сессия пользователя не найдена."
        }
      );
    }

    const isValidSession =
      await verifySupabaseSession(
        token
      );

    if (!isValidSession) {
      return sendJson(
        res,
        401,
        {
          error:
            "Сессия пользователя недействительна."
        }
      );
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const prompt = String(
      body.prompt || ""
    ).trim();

    if (!prompt) {
      return sendJson(
        res,
        400,
        {
          error:
            "Промт не указан."
        }
      );
    }

    if (prompt.length > 8000) {
      return sendJson(
        res,
        400,
        {
          error:
            "Промт слишком длинный."
        }
      );
    }

    const model =
      ALLOWED_MODELS.has(
        body.model
      )
        ? body.model
        : "gemini-3.1-flash-lite-image";

    const aspectRatio =
      ALLOWED_ASPECT_RATIOS.has(
        body.aspectRatio
      )
        ? body.aspectRatio
        : "16:9";

    let imageSize =
      ALLOWED_IMAGE_SIZES.has(
        body.imageSize
      )
        ? body.imageSize
        : "1K";

    if (
      model ===
      "gemini-3.1-flash-lite-image"
    ) {
      imageSize = "1K";
    }

    const images =
      normalizeImages(
        body.images
      );

    const previousInteractionId =
      String(
        body.previousInteractionId ||
          ""
      ).trim();

    const input = images.length
      ? [
          {
            type: "text",
            text: prompt
          },
          ...images
        ]
      : prompt;

    const geminiPayload = {
      model,

      input,

      response_format: {
        type: "image",

        mime_type:
          "image/jpeg",

        aspect_ratio:
          aspectRatio,

        image_size:
          imageSize
      }
    };

    if (previousInteractionId) {
      geminiPayload.previous_interaction_id =
        previousInteractionId;
    }

    const geminiResponse =
      await fetch(
        GEMINI_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey
          },

          body: JSON.stringify(
            geminiPayload
          )
        }
      );

    const geminiData =
      await geminiResponse
        .json()
        .catch(() => ({}));

    if (!geminiResponse.ok) {
      const message =
        geminiData?.error?.message ||
        geminiData?.message ||
        `Gemini API вернул ошибку ${geminiResponse.status}.`;

      return sendJson(
        res,
        geminiResponse.status,
        {
          error: message
        }
      );
    }

    const output =
      collectOutput(
        geminiData
      );

    if (!output.image?.data) {
      return sendJson(
        res,
        502,
        {
          error:
            output.text ||
            "Gemini завершил запрос без изображения."
        }
      );
    }

    return sendJson(
      res,
      200,
      output
    );
  } catch (error) {
    console.error(
      "ecosima-ai error:",
      error
    );

    return sendJson(
      res,
      500,
      {
        error:
          error.message ||
          "Внутренняя ошибка AI-сервера."
      }
    );
  }
};