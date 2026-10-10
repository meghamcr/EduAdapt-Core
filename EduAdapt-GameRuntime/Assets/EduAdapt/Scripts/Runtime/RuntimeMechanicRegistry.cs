using System;
using System.Collections.Generic;
using UnityEngine;

namespace EduAdapt.Runtime
{
    public interface IRuntimeMechanic
    {
        void Draw(RuntimeChallenge challenge, GUIStyle button, Action<string> text, Action<int> choice);
    }
    // Registry keys are contract mechanics. Renderers know no curriculum identity,
    // answers, scoring or learner difficulty rules. GUI events use Unity's UI event
    // system; no legacy UnityEngine.Input calls are used.
    public sealed class RuntimeMechanicRegistry
    {
        private readonly Dictionary<string, IRuntimeMechanic> renderers = new Dictionary<string, IRuntimeMechanic>();
        public RuntimeMechanicRegistry()
        {
            Reset();
        }
        public void Reset()
        {
            renderers.Clear();
            renderers.Add("CONSTRUCTION", new ConstructionMechanic());
            renderers.Add("CLOZE", new TextResponseMechanic());
            renderers.Add("MCQ_CLOZE", new OptionResponseMechanic());
        }
        public bool TryGet(string mechanic, out IRuntimeMechanic renderer)
        {
            renderer = null;
            return mechanic != null && renderers.TryGetValue(mechanic, out renderer);
        }
        private sealed class TextResponseMechanic : IRuntimeMechanic
        {
            private string challengeId, answer = "";
            public void Draw(RuntimeChallenge challenge, GUIStyle button, Action<string> text, Action<int> choice)
            {
                if (challengeId != challenge.id) { challengeId = challenge.id; answer = ""; }
                answer = GUILayout.TextField(answer, 120);
                if (GUILayout.Button("Submit", button)) text(answer);
            }
        }
        private sealed class OptionResponseMechanic : IRuntimeMechanic
        {
            public void Draw(RuntimeChallenge challenge, GUIStyle button, Action<string> text, Action<int> choice)
            {
                for (int i = 0; i < challenge.choices.Length; i++)
                    if (GUILayout.Button(challenge.choices[i], button)) choice(i);
            }
        }
    }
}
