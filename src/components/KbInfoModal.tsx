import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function KbInfoModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="kbInfoBackdrop" onClick={onClose} role="presentation">
      <div
        className="kbInfoModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kbInfoModalHead">
          <h2 id="kb-info-title">Справка: термины и выбор ответа</h2>
          <button type="button" className="btn secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="kbInfoModalBody">
          <p className="kbInfoLead">
            Ниже — как устроен файл <code>knowledge_base.json</code> в этом редакторе и как бэкенд проекта (модуль{" "}
            <code>kb_engine</code>) подбирает ответ из <strong>qa_pairs</strong>. Это не произвольный «чат с ИИ»: сначала
            работает <strong>семантический поиск</strong> по вопросам, затем из найденной пары берётся готовый текст
            ответа.
          </p>

          <h3>Термины</h3>
          <dl className="kbInfoDl">
            <dt>
              <code>knowledge_base.json</code>
            </dt>
            <dd>Единый файл базы знаний: псевдонимы продуктов, сценарии Q&amp;A и правила рекомендаций.</dd>

            <dt>
              <code>product_aliases</code>
            </dt>
            <dd>
              Словарь «код продукта → синонимы» на языках <code>ru</code>, <code>en</code>, <code>de</code>. Нужен, чтобы
              в распознавании речи и в тексте находить упоминания товара (в т.ч. для <code>product_filter</code> и
              шаблонов с товаром).
            </dd>

            <dt>
              <code>qa_pairs</code>
            </dt>
            <dd>Список сценариев диалога. У каждого сценария есть уникальный <code>id</code> и поля вопросов/ответов.</dd>

            <dt>Сценарий (пара Q&amp;A)</dt>
            <dd>Одна запись в <code>qa_pairs</code>: набор формулировок вопроса и вариантов ответа на трёх языках.</dd>

            <dt>
              <code>id</code>
            </dt>
            <dd>Строковый идентификатор сценария (например <code>ST001</code>). Попадает в метаданные индекса поиска.</dd>

            <dt>
              <code>category</code>
            </dt>
            <dd>Категория сценария (например <code>small_talk</code>, <code>info</code>, <code>recommendation</code>,{" "}
              <code>product_info</code>) — для логики и отладки; в редакторе задаётся вручную.</dd>

            <dt>
              <code>questions</code> / <code>answers</code>
            </dt>
            <dd>
              Для обычного сценария: массивы строк по языкам <code>ru</code>, <code>en</code>, <code>de</code>. Каждая
              непустая строка — отдельный вариант. В индекс попадают вопросы; при совпадении возвращается один из вариантов
              ответа на том же языке, что и у пользователя.
            </dd>

            <dt>
              <code>product_filter</code>
            </dt>
            <dd>
              Необязательно. Если задан код продукта (как в <code>product_aliases</code>), ответ из этой пары
              используется только если в вопросе распознан этот продукт по псевдонимам.
            </dd>

            <dt>
              <code>type: &quot;product_template&quot;</code>
            </dt>
            <dd>
              Особый сценарий: вместо <code>questions</code>/<code>answers</code> — <code>question_templates</code> и{" "}
              <code>answer_template</code>. В текстах используются плейсхолдеры вроде <code>{"{product}"}</code>,{" "}
              <code>{"{product_name}"}</code>, <code>{"{product_benefit}"}</code>; при ответе они подставляются из
              каталога товаров.
            </dd>

            <dt>
              <code>recommendation_rules</code>
            </dt>
            <dd>
              Блоки <code>by_effect</code>, <code>by_ingredient</code>, <code>by_color</code>: ключевые слова → списки
              кодов продуктов. В этом редакторе правятся в режиме «Сырой JSON». Срабатывают по <strong>вхождению слова</strong>{" "}
              в вопрос (отдельный шаг пайплайна после семантического Q&amp;A).
            </dd>

            <dt>Семантический поиск (RAG по базе)</dt>
            <dd>
              Вопрос пользователя кодируется вектором (модель эмбеддингов, в проекте —{" "}
              <code>paraphrase-multilingual-MiniLM-L12-v2</code>), затем ищутся ближайшие по смыслу <strong>варианты
              вопросов</strong> в векторной базе ChromaDB (коллекция <code>kb_qa</code>), с фильтром по языку запроса.
            </dd>
          </dl>

          <h3>Как выбирается ответ из базы знаний</h3>
          <ol className="kbInfoOl">
            <li>
              Определяется язык реплики пользователя (<code>ru</code>, <code>en</code> или <code>de</code>); при
              неуверенности берётся русский.
            </li>
            <li>
              По этому языку в ChromaDB запрашиваются несколько ближайших к вопросу документов (каждый документ — один
              вариант вопроса из какой-то пары <code>qa_pairs</code>).
            </li>
            <li>
              Берётся <strong>лучший</strong> результат. Близость переводится в оценку от 0 до 1; если она{" "}
              <strong>ниже порога 0,50</strong>, ответ из базы <strong>не выдаётся</strong> — сработают другие обработчики
              пайплайна.
            </li>
            <li>
              Если пара обычная: из поля <code>answers</code> для языка пользователя случайно выбирается{" "}
              <strong>один</strong> из сохранённых вариантов ответа (разнообразие формулировок).
            </li>
            <li>
              Если пара — <code>product_template</code>: должен быть понятен продукт (из вопроса или контекста); затем
              случайно выбирается шаблон ответа и подставляются <code>{"{product_name}"}</code> /{" "}
              <code>{"{product_benefit}"}</code>.
            </li>
            <li>
              Если задан <code>product_filter</code>, но нужный продукт в вопросе не найден по псевдонимам, эта пара{" "}
              <strong>не используется</strong>, даже при высокой схожести вопроса.
            </li>
          </ol>

          <p className="kbInfoNote muted">
            Имеет смысл добавлять несколько формулировок одного и того же вопроса и несколько вариантов ответа — так выше
            шанс попасть в семантический поиск и меньше повторяемость ответов. Правила из <code>recommendation_rules</code>{" "}
            не участвуют в этом шаге: они обрабатываются отдельно, если семантический Q&amp;A не дал ответа.
          </p>
        </div>
      </div>
    </div>
  );
}
