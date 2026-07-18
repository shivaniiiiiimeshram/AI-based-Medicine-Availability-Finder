import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
import joblib
import os

# ── Load dataset ──────────────────────────────────────────────────────────────
df = pd.read_csv('data.csv')
print(f"Loaded {len(df)} training examples")
print(df)

# ── Features and labels ───────────────────────────────────────────────────────
X = df['symptom']
y = df['medicine']

# ── Vectorize text ────────────────────────────────────────────────────────────
vectorizer = CountVectorizer()
X_vectorized = vectorizer.fit_transform(X)

# ── Train Naive Bayes model ───────────────────────────────────────────────────
model = MultinomialNB()
model.fit(X_vectorized, y)
print("\nModel trained successfully!")

# ── Save model and vectorizer ─────────────────────────────────────────────────
joblib.dump(model,      'model.pkl')
joblib.dump(vectorizer, 'vectorizer.pkl')
print("Saved: model.pkl")
print("Saved: vectorizer.pkl")

# ── Quick self-test ───────────────────────────────────────────────────────────
test_symptoms = ['fever', 'headache', 'cough', 'cold', 'pain']
print("\n── Self-test predictions ──")
for s in test_symptoms:
    vec = vectorizer.transform([s])
    pred = model.predict(vec)[0]
    print(f"  '{s}' → {pred}")
