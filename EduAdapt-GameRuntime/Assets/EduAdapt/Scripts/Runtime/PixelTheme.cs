using UnityEngine;
namespace EduAdapt.Runtime
{
    public static class PixelTheme
    {
        private static Font font;
        private static Texture2D panelTexture,buttonTexture,hoverTexture;
        public static Font Font => font ?? (font=Resources.Load<Font>("Fonts/PressStart2P-Regular"));
        private static Texture2D Tile(Color c) {var t=new Texture2D(1,1);t.SetPixel(0,0,c);t.filterMode=FilterMode.Point;t.Apply();return t;}
        public static readonly Color Background = new Color32(11,19,30,255);
        public static readonly Color Panel = new Color32(19,30,44,255);
        public static readonly Color Green = new Color32(25,185,142,255);
        public static void Apply()
        {
            if(font==null) font=Resources.Load<Font>("Fonts/PressStart2P-Regular");
            GUI.skin.font=font;
            if(panelTexture==null){panelTexture=Tile(Panel);buttonTexture=Tile(new Color32(0,107,89,255));hoverTexture=Tile(Green);}
            GUI.skin.box.normal.background=panelTexture;
            GUI.skin.button.normal.background=buttonTexture;
            GUI.skin.button.hover.background=hoverTexture;
            GUI.skin.button.active.background=hoverTexture;
            GUI.skin.button.focused.background=buttonTexture;
            GUI.skin.button.border=new RectOffset(0,0,0,0);
            foreach(var style in new[]{GUI.skin.label,GUI.skin.button,GUI.skin.box,GUI.skin.textField})
            {
                style.font=font;style.fontSize=Mathf.Clamp(Screen.width/90,10,16);style.richText=false;style.wordWrap=true;
                style.normal.textColor=Color.white;style.padding=new RectOffset(12,12,10,10);
            }
            GUI.skin.button.fixedHeight=44;
        }
        public static void Fill(Rect rect,Color color){var old=GUI.color;GUI.color=color;GUI.DrawTexture(rect,Texture2D.whiteTexture);GUI.color=old;}
        public static void Frame(Rect rect,Color color){Fill(rect,color);Fill(new Rect(rect.x+3,rect.y+3,rect.width-6,rect.height-6),Panel);}
        public static void Celebration(Rect area)
        {
            for(int i=0;i<32;i++){float x=(i*71%997)/997f*area.width,y=(Time.unscaledTime*45+i*29)%area.height;
                Fill(new Rect(area.x+x,area.y+y,5,5),i%2==0?Green:new Color(1,.8f,.3f));}
        }
    }
}
